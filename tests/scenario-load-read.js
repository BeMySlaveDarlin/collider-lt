import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';
import { check } from 'k6';
import { BASE_URL, getRandomUserId } from '../utils/helpers.js';

const readRps = new Rate('read_rps');
const readErrors = new Counter('read_errors');
const readDuration = new Trend('read_duration', true);
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');

export const options = {
	thresholds: {
		'http_req_duration': ['p(95)<300', 'p(99)<800'],
		'http_req_failed': ['rate<0.02'],
		'read_rps': ['rate>200'],
		'read_errors': ['count<20'],
	},
	scenarios: {
		load_read_events: {
			executor: 'constant-arrival-rate',
			rate: 80,
			timeUnit: '1s',
			duration: '5m',
			preAllocatedVUs: 15,
			maxVUs: 40,
			env: { ENDPOINT_TYPE: 'events' },
		},
		load_read_user_events: {
			executor: 'constant-arrival-rate',
			rate: 60,
			timeUnit: '1s',
			duration: '5m',
			preAllocatedVUs: 10,
			maxVUs: 30,
			env: { ENDPOINT_TYPE: 'user_events' },
		},
		load_read_stats: {
			executor: 'constant-arrival-rate',
			rate: 20,
			timeUnit: '1s',
			duration: '5m',
			preAllocatedVUs: 8,
			maxVUs: 20,
			env: { ENDPOINT_TYPE: 'stats' },
		},
	},
};

export default function() {
	const endpointType = __ENV.ENDPOINT_TYPE || 'events';
	let url, endpointName;

	switch(endpointType) {
		case 'events':
			const page = Math.floor(Math.random() * 100) + 1;
			const limit = [10, 50, 100, 500][Math.floor(Math.random() * 4)];
			url = `${BASE_URL}/events?page=${page}&limit=${limit}`;
			endpointName = 'get_events';
			break;

		case 'user_events':
			const userId = getRandomUserId();
			// Лимит всегда 1000 согласно требованиям
			url = `${BASE_URL}/users/${userId}/events?limit=1000`;
			endpointName = 'get_user_events';
			break;

		case 'stats':
			const queryParams = [];
			if (Math.random() > 0.5) {
				const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
				queryParams.push(`from=${fromDate.toISOString()}`);
			}
			if (Math.random() > 0.7) {
				const types = ['click', 'page_view', 'scroll'];
				const type = types[Math.floor(Math.random() * types.length)];
				queryParams.push(`type=${type}`);
			}
			const statsLimit = [3, 5, 10][Math.floor(Math.random() * 3)];
			queryParams.push(`limit=${statsLimit}`);
			const queryString = queryParams.length > 0 ? '?' + queryParams.join('&') : '';
			url = `${BASE_URL}/stats${queryString}`;
			endpointName = 'get_stats';
			break;
	}

	const params = {
		tags: {
			endpoint: endpointName,
			scenario: 'load_read',
			endpoint_type: endpointType
		},
	};

	const response = http.get(url, params);

	const success = check(response, {
		[`${endpointName}: status is 200`]: (r) => r.status === 200,
		[`${endpointName}: response time acceptable`]: (r) => r.timings.duration < 2000,
		[`${endpointName}: has response body`]: (r) => r.body.length > 0,
	});

	// Детекция кеша по времени ответа (кешированные запросы быстрее)
	// Для stats запросов кеш особенно важен из-за тяжести
	if (endpointType === 'stats') {
		if (response.timings.duration < 100) {
			cacheHits.add(1);
		} else {
			cacheMisses.add(1);
		}
	} else {
		if (response.timings.duration < 50) {
			cacheHits.add(1);
		} else {
			cacheMisses.add(1);
		}
	}

	readRps.add(success);
	readDuration.add(response.timings.duration);

	if (!success) {
		readErrors.add(1);
		console.error(`Read ${endpointType} failed: ${response.status}`);
	}
}

export function handleSummary(data) {
	const totalRequests = data.metrics.http_reqs.values.count;
	const failedRate = data.metrics.http_req_failed.values.rate * 100;
	const avgDuration = data.metrics.http_req_duration.values.avg;
	const p95Duration = data.metrics.http_req_duration.values['p(95)'];
	const rps = data.metrics.http_reqs.values.rate;
	const cacheHitCount = data.metrics.cache_hits ? data.metrics.cache_hits.values.count : 0;
	const cacheMissCount = data.metrics.cache_misses ? data.metrics.cache_misses.values.count : 0;
	const cacheHitRate = cacheHitCount > 0 ? (cacheHitCount / (cacheHitCount + cacheMissCount) * 100) : 0;

	return {
		'results/load-read-summary.json': JSON.stringify(data),
		stdout: `
╔══════════════════════════════════════════════════════════════╗
║                    LOAD TEST: READ (RPS)                    ║
╠══════════════════════════════════════════════════════════════╣
║ Total Requests: ${totalRequests}
║ Failed Requests: ${failedRate.toFixed(2)}%
║ RPS Achieved: ${rps.toFixed(2)}
║ Avg Response Time: ${avgDuration.toFixed(2)}ms
║ 95th Percentile: ${p95Duration.toFixed(2)}ms
║ Cache Hit Rate: ${cacheHitRate.toFixed(2)}% (${cacheHitCount}/${cacheHitCount + cacheMissCount})
║ 
║ NOTE: Только GET запросы, кеш НЕ сбрасывается
║ Errors: ${data.metrics.read_errors.values.count}
╚══════════════════════════════════════════════════════════════╝
    `,
	};
}
