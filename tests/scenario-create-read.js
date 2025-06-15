import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { check } from 'k6';
import { BASE_URL, generateEventPayload, getRandomUserId } from '../utils/helpers.js';

const mixedRps = new Rate('mixed_rps');
const createCount = new Counter('create_count');
const readCount = new Counter('read_count');
const createErrors = new Counter('create_errors');
const readErrors = new Counter('read_errors');
const createDuration = new Trend('create_duration', true);
const readDuration = new Trend('read_duration', true);
const cacheInvalidations = new Counter('cache_invalidations');

export const options = {
	thresholds: {
		'http_req_duration': ['p(95)<800', 'p(99)<1500'],
		'http_req_failed': ['rate<0.05'],
		'mixed_rps': ['rate>150'],
		'create_errors': ['count<25'],
		'read_errors': ['count<15'],
	},
	scenarios: {
		mixed_create_read: {
			executor: 'constant-arrival-rate',
			rate: 150,
			timeUnit: '1s',
			duration: '5m',
			preAllocatedVUs: 25,
			maxVUs: 80,
		},
	},
};

export default function() {
	// 30% создание, 70% чтение
	const isCreate = Math.random() < 0.3;

	if (isCreate) {
		performCreate();
		// После создания сбрасывается кеш, читаем данные для проверки
		sleep(0.1);
		performRead();
		cacheInvalidations.add(1);
	} else {
		performRead();
	}
}

function performCreate() {
	const payload = generateEventPayload();

	const params = {
		headers: {
			'Content-Type': 'application/json',
		},
		tags: {
			endpoint: 'create_event',
			scenario: 'mixed_create_read',
			operation: 'create'
		},
	};

	const response = http.post(`${BASE_URL}/event`, JSON.stringify(payload), params);

	const success = check(response, {
		'create: status is 201': (r) => r.status === 201,
		'create: response time acceptable': (r) => r.timings.duration < 1000,
	});

	createCount.add(1);
	createDuration.add(response.timings.duration);
	mixedRps.add(success);

	if (!success) {
		createErrors.add(1);
		console.error(`Create failed: ${response.status}`);
	}
}

function performRead() {
	// Выбираем случайный тип чтения (убираем DELETE из смешанного теста)
	const readType = Math.floor(Math.random() * 3);
	let url, endpointName;

	switch(readType) {
		case 0: // GET /events
			const page = Math.floor(Math.random() * 50) + 1;
			const limit = [10, 50, 100][Math.floor(Math.random() * 3)];
			url = `${BASE_URL}/events?page=${page}&limit=${limit}`;
			endpointName = 'get_events';
			break;

		case 1: // GET /users/{user_id}/events (всегда limit=1000)
			const userId = getRandomUserId();
			url = `${BASE_URL}/users/${userId}/events?limit=1000`;
			endpointName = 'get_user_events';
			break;

		case 2: // GET /stats (самый тяжелый)
			const queryParams = [];
			if (Math.random() > 0.7) {
				const types = ['click', 'page_view', 'scroll'];
				const type = types[Math.floor(Math.random() * types.length)];
				queryParams.push(`type=${type}`);
			}
			const statsLimit = [3, 5][Math.floor(Math.random() * 2)];
			queryParams.push(`limit=${statsLimit}`);
			const queryString = queryParams.length > 0 ? '?' + queryParams.join('&') : '';
			url = `${BASE_URL}/stats${queryString}`;
			endpointName = 'get_stats';
			break;
	}

	const params = {
		tags: {
			endpoint: endpointName,
			scenario: 'mixed_create_read',
			operation: 'read'
		},
	};

	const response = http.get(url, params);

	const success = check(response, {
		'read: status is 200': (r) => r.status === 200,
		'read: response time acceptable': (r) => r.timings.duration < 1000,
	});

	readCount.add(1);
	readDuration.add(response.timings.duration);
	mixedRps.add(success);

	if (!success) {
		readErrors.add(1);
		console.error(`Read ${endpointName} failed: ${response.status}`);
	}
}

export function handleSummary(data) {
	const totalRequests = data.metrics.http_reqs.values.count;
	const failedRate = data.metrics.http_req_failed.values.rate * 100;
	const avgDuration = data.metrics.http_req_duration.values.avg;
	const p95Duration = data.metrics.http_req_duration.values['p(95)'];
	const rps = data.metrics.http_reqs.values.rate;
	const createOps = data.metrics.create_count.values.count;
	const readOps = data.metrics.read_count.values.count;
	const cacheInvalidationsCount = data.metrics.cache_invalidations.values.count;

	return {
		'results/create-read-summary.json': JSON.stringify(data),
		stdout: `
╔══════════════════════════════════════════════════════════════╗
║                 LOAD TEST: CREATE/READ (RPS)                 ║
╠══════════════════════════════════════════════════════════════╣
║ Total Requests: ${totalRequests}
║ Failed Requests: ${failedRate.toFixed(2)}%
║ RPS Achieved: ${rps.toFixed(2)}
║ Create Operations: ${createOps} (${(createOps/totalRequests*100).toFixed(1)}%)
║ Read Operations: ${readOps} (${(readOps/totalRequests*100).toFixed(1)}%)
║ Cache Invalidations: ${cacheInvalidationsCount}
║ Avg Response Time: ${avgDuration.toFixed(2)}ms
║ 95th Percentile: ${p95Duration.toFixed(2)}ms
║ 
║ NOTE: DELETE операции убраны из смешанного теста
║ Create Errors: ${data.metrics.create_errors.values.count}
║ Read Errors: ${data.metrics.read_errors.values.count}
╚══════════════════════════════════════════════════════════════╝
    `,
	};
}
