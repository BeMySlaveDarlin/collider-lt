import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { check } from 'k6';
import { BASE_URL, generateEventPayload, getRandomUserId } from '../utils/helpers.js';

const fullLoadRps = new Rate('full_load_rps');
const createCount = new Counter('create_count');
const readCount = new Counter('read_count');
const createErrors = new Counter('create_errors');
const readErrors = new Counter('read_errors');
const operationDuration = new Trend('operation_duration', true);
const cacheEvents = new Counter('cache_events');

export const options = {
	thresholds: {
		'http_req_duration': ['p(95)<1000', 'p(99)<2000'],
		'http_req_failed': ['rate<0.08'],
		'full_load_rps': ['rate>120'],
		'create_errors': ['count<30'],
		'read_errors': ['count<20'],
	},
	scenarios: {
		full_load_mixed: {
			executor: 'constant-arrival-rate',
			rate: 120,
			timeUnit: '1s',
			duration: '8m',
			preAllocatedVUs: 30,
			maxVUs: 80,
		},
	},
};

export default function() {
	// Распределение операций: 60% чтение, 40% создание (убираем DELETE)
	const operation = getRandomOperation();

	switch(operation) {
		case 'create':
			performCreate();
			break;
		case 'read':
			performRead();
			break;
	}
}

function getRandomOperation() {
	const rand = Math.random();
	if (rand < 0.60) return 'read';     // 60% чтение
	return 'create';                    // 40% создание
}

function performCreate() {
	const payload = generateEventPayload();

	const params = {
		headers: {
			'Content-Type': 'application/json',
		},
		tags: {
			endpoint: 'create_event',
			scenario: 'full_load',
			operation: 'create'
		},
	};

	const response = http.post(`${BASE_URL}/event`, JSON.stringify(payload), params);

	const success = check(response, {
		'create: status is 201': (r) => r.status === 201,
		'create: response time acceptable': (r) => r.timings.duration < 1500,
	});

	createCount.add(1);
	operationDuration.add(response.timings.duration);
	fullLoadRps.add(success);

	if (success) {
		// После создания кеш сброшен
		cacheEvents.add(1);
	} else {
		createErrors.add(1);
		console.error(`Create failed: ${response.status}`);
	}
}

function performRead() {
	const readType = Math.floor(Math.random() * 3);
	let url, endpointName;

	switch(readType) {
		case 0:
			const page = Math.floor(Math.random() * 100) + 1;
			const limit = [10, 50, 100, 500][Math.floor(Math.random() * 4)];
			url = `${BASE_URL}/events?page=${page}&limit=${limit}`;
			endpointName = 'get_events';
			break;

		case 1:
			const userId = getRandomUserId();
			url = `${BASE_URL}/users/${userId}/events?limit=1000`;
			endpointName = 'get_user_events';
			break;

		case 2:
			const queryParams = [];
			if (Math.random() > 0.5) {
				const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
				queryParams.push(`from=${fromDate.toISOString()}`);
			}
			if (Math.random() > 0.7) {
				const types = ['click', 'page_view', 'scroll', 'hover'];
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
			scenario: 'full_load',
			operation: 'read'
		},
	};

	const response = http.get(url, params);

	const success = check(response, {
		'read: status is 200': (r) => r.status === 200,
		'read: response time acceptable': (r) => r.timings.duration < 1000,
	});

	readCount.add(1);
	operationDuration.add(response.timings.duration);
	fullLoadRps.add(success);

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
	const cacheEventsCount = data.metrics.cache_events.values.count;

	return {
		'results/full-load-summary.json': JSON.stringify(data),
		stdout: `
╔══════════════════════════════════════════════════════════════╗
║                FULL LOAD TEST: CREATE/READ (RPS)            ║
╠══════════════════════════════════════════════════════════════╣
║ Total Requests: ${totalRequests}
║ Failed Requests: ${failedRate.toFixed(2)}%
║ RPS Achieved: ${rps.toFixed(2)}
║ 
║ Operations Distribution:
║   Create: ${createOps} (${(createOps/totalRequests*100).toFixed(1)}%)
║   Read: ${readOps} (${(readOps/totalRequests*100).toFixed(1)}%)
║
║ Performance:
║   Avg Response Time: ${avgDuration.toFixed(2)}ms
║   95th Percentile: ${p95Duration.toFixed(2)}ms
║   Cache Invalidations: ${cacheEventsCount}
║
║ Errors:
║   Create Errors: ${data.metrics.create_errors.values.count}
║   Read Errors: ${data.metrics.read_errors.values.count}
║
║ NOTE: DELETE операции убраны согласно обновлениям
╚══════════════════════════════════════════════════════════════╝
    `,
	};
}
