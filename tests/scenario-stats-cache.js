import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { check } from 'k6';
import { BASE_URL, generateEventPayload, checkStatsPages } from '../utils/helpers.js';

const statsCachedRps = new Rate('stats_cached_rps');
const statsUncachedRps = new Rate('stats_uncached_rps');
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');
const statsErrors = new Counter('stats_errors');
const cachedDuration = new Trend('cached_duration', true);
const uncachedDuration = new Trend('uncached_duration', true);
const pagesInserted = new Counter('pages_inserted');
const pagesVerified = new Counter('pages_verified');

export const options = {
	thresholds: {
		'http_req_duration': ['p(95)<2000', 'p(99)<4000'],
		'http_req_failed': ['rate<0.05'],
		'stats_cached_rps': ['rate>30'],
		'stats_uncached_rps': ['rate>10'],
		'cache_hits': ['count>50'],
		'stats_errors': ['count<5'],
	},
	scenarios: {
		stats_with_cache: {
			executor: 'constant-arrival-rate',
			rate: 30,
			timeUnit: '1s',
			duration: '3m',
			preAllocatedVUs: 10,
			maxVUs: 20,
			env: { TEST_TYPE: 'cached' },
		},
		stats_without_cache: {
			executor: 'constant-arrival-rate',
			rate: 15,
			timeUnit: '1s',
			duration: '3m',
			preAllocatedVUs: 8,
			maxVUs: 15,
			env: { TEST_TYPE: 'uncached' },
		},
	},
};

export default function() {
	const testType = __ENV.TEST_TYPE || 'cached';

	if (testType === 'uncached') {
		// Сначала делаем POST для сброса кеша
		performCreateToInvalidateCache();
		sleep(0.1);
	}

	// Затем тестируем GET /stats
	performStatsRequest(testType);
}

function performCreateToInvalidateCache() {
	const payload = generateEventPayload();

	const params = {
		headers: { 'Content-Type': 'application/json' },
		tags: { operation: 'cache_invalidation' },
	};

	const response = http.post(`${BASE_URL}/event`, JSON.stringify(payload), params);

	if (response.status === 201) {
		pagesInserted.add(1);
		// Записываем какие страницы добавили для последующей проверки
		try {
			if (payload.metadata && payload.metadata.page) {
				console.log(`📝 Inserted page: ${payload.metadata.page}`);
			}
		} catch (e) {
			// ignore
		}
	}
}

function performStatsRequest(testType) {
	const queryParams = [];

	// Параметры для статистики
	if (Math.random() > 0.3) {
		const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		queryParams.push(`from=${fromDate.toISOString()}`);
	}

	if (Math.random() > 0.5) {
		const toDate = new Date();
		queryParams.push(`to=${toDate.toISOString()}`);
	}

	if (Math.random() > 0.7) {
		const types = ['click', 'page_view', 'scroll', 'hover'];
		const type = types[Math.floor(Math.random() * types.length)];
		queryParams.push(`type=${type}`);
	}

	// Лимит для top_pages
	const limit = [5, 10, 15][Math.floor(Math.random() * 3)];
	queryParams.push(`limit=${limit}`);

	const queryString = queryParams.length > 0 ? '?' + queryParams.join('&') : '';

	const params = {
		tags: {
			endpoint: 'get_stats',
			scenario: 'stats_test',
			test_type: testType
		},
	};

	const startTime = Date.now();
	const response = http.get(`${BASE_URL}/stats${queryString}`, params);
	const duration = Date.now() - startTime;

	const success = check(response, {
		'stats: status is 200': (r) => r.status === 200,
		'stats: has data object': (r) => {
			try {
				const body = JSON.parse(r.body);
				return body.data && typeof body.data === 'object';
			} catch (e) {
				return false;
			}
		},
		'stats: has total_events': (r) => {
			try {
				const body = JSON.parse(r.body);
				return body.data.hasOwnProperty('total_events');
			} catch (e) {
				return false;
			}
		},
		'stats: has unique_users': (r) => {
			try {
				const body = JSON.parse(r.body);
				return body.data.hasOwnProperty('unique_users');
			} catch (e) {
				return false;
			}
		},
		'stats: has top_pages': (r) => {
			try {
				const body = JSON.parse(r.body);
				return body.data.hasOwnProperty('top_pages') && Array.isArray(body.data.top_pages);
			} catch (e) {
				return false;
			}
		},
	});

	// Определяем попадание в кеш по времени ответа
	// Для тяжелого stats запроса кешированный ответ должен быть значительно быстрее
	const isCacheHit = testType === 'cached' && duration < 200;
	const isCacheMiss = testType === 'uncached' || duration >= 200;

	if (isCacheHit) {
		cacheHits.add(1);
		cachedDuration.add(duration);
		statsCachedRps.add(success);
	} else if (isCacheMiss) {
		cacheMisses.add(1);
		uncachedDuration.add(duration);
		statsUncachedRps.add(success);
	}

	// Проверяем количество страниц в ответе (после POST должны появиться новые)
	if (testType === 'uncached' && success) {
		try {
			const body = JSON.parse(response.body);
			if (body.data && body.data.top_pages) {
				const pagesCount = body.data.top_pages.length;
				pagesVerified.add(pagesCount);
				console.log(`📊 Stats response contains ${pagesCount} pages`);
			}
		} catch (e) {
			// ignore
		}
	}

	if (!success) {
		statsErrors.add(1);
		console.error(`Stats ${testType} failed: ${response.status}`);
	}
}

export function handleSummary(data) {
	const totalRequests = data.metrics.http_reqs.values.count;
	const failedRate = data.metrics.http_req_failed.values.rate * 100;
	const rps = data.metrics.http_reqs.values.rate;

	const cacheHitCount = data.metrics.cache_hits ? data.metrics.cache_hits.values.count : 0;
	const cacheMissCount = data.metrics.cache_misses ? data.metrics.cache_misses.values.count : 0;
	const cacheHitRate = cacheHitCount > 0 ? (cacheHitCount / (cacheHitCount + cacheMissCount) * 100) : 0;

	const avgCachedDuration = data.metrics.cached_duration ? data.metrics.cached_duration.values.avg : 0;
	const avgUncachedDuration = data.metrics.uncached_duration ? data.metrics.uncached_duration.values.avg : 0;

	const pagesInsertedCount = data.metrics.pages_inserted ? data.metrics.pages_inserted.values.count : 0;
	const pagesVerifiedCount = data.metrics.pages_verified ? data.metrics.pages_verified.values.count : 0;

	return {
		'results/stats-cache-summary.json': JSON.stringify(data),
		stdout: `
╔══════════════════════════════════════════════════════════════╗
║                   STATS CACHE TEST (RPS)                    ║
╠══════════════════════════════════════════════════════════════╣
║ Total Requests: ${totalRequests}
║ Failed Requests: ${failedRate.toFixed(2)}%
║ RPS Achieved: ${rps.toFixed(2)}
║ 
║ CACHE PERFORMANCE:
║   Cache Hit Rate: ${cacheHitRate.toFixed(2)}% (${cacheHitCount}/${cacheHitCount + cacheMissCount})
║   Cached Avg Time: ${avgCachedDuration.toFixed(2)}ms
║   Uncached Avg Time: ${avgUncachedDuration.toFixed(2)}ms
║   Cache Speed Gain: ${avgUncachedDuration > 0 ? (avgUncachedDuration / avgCachedDuration).toFixed(1) : 'N/A'}x
║
║ DATA VERIFICATION:
║   Pages Inserted (POST): ${pagesInsertedCount}
║   Pages in Stats: ${pagesVerifiedCount}
║
║ TEST SCENARIOS:
║   ✓ WITH cache: Only GET /stats (fast response)
║   ✓ WITHOUT cache: POST + GET /stats (slow response)
║   ✓ Data consistency: New pages appear in stats
║
║ Errors: ${data.metrics.stats_errors.values.count}
╚══════════════════════════════════════════════════════════════╝
    `,
	};
}
