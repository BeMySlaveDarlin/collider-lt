import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, checkApiResponse, generateEventPayload, logTestResult } from '../utils/helpers.js';

const createRps = new Rate('create_rps');
const createErrors = new Counter('create_errors');
const createDuration = new Trend('create_duration', true);

export const options = {
	thresholds: {
		'http_req_duration': ['p(95)<200', 'p(99)<500'],
		'http_req_failed': ['rate<0.01'],
		'create_rps': ['rate>2000'],
		'create_errors': ['count<100'],
	},
	scenarios: {
		load_create: {
			executor: 'constant-arrival-rate',
			rate: 3000,
			timeUnit: '1s',
			duration: '5m',
			preAllocatedVUs: 100,
			maxVUs: 500,
		},
	},
};

export default function() {
	const payload = generateEventPayload();

	const params = {
		headers: {
			'Content-Type': 'application/json',
		},
		tags: {
			endpoint: 'create_event',
			scenario: 'load_create'
		},
	};

	const response = http.post(`${BASE_URL}/event`, JSON.stringify(payload), params);

	const success = checkApiResponse(response, 'create_event');

	createRps.add(success);
	createDuration.add(response.timings.duration);

	if (!success) {
		createErrors.add(1);
		console.error(`Create failed: ${response.status} - ${response.body}`);
	}
}

export function handleSummary(data) {
	const totalRequests = data.metrics.http_reqs.values.count;
	const failedRate = data.metrics.http_req_failed.values.rate * 100;
	const avgDuration = data.metrics.http_req_duration.values.avg;
	const p95Duration = data.metrics.http_req_duration.values['p(95)'];
	const rps = data.metrics.http_reqs.values.rate;

	return {
		'results/load-create-summary.json': JSON.stringify(data),
		stdout: `
╔══════════════════════════════════════════════════════════════╗
║                   LOAD TEST: CREATE (RPS)                   ║
╠══════════════════════════════════════════════════════════════╣
║ Total Requests: ${totalRequests}
║ Failed Requests: ${failedRate.toFixed(2)}%
║ RPS Achieved: ${rps.toFixed(2)} (Target: 3000+)
║ Avg Response Time: ${avgDuration.toFixed(2)}ms
║ 95th Percentile: ${p95Duration.toFixed(2)}ms
║ Errors: ${data.metrics.create_errors.values.count}
║
║ Performance Grade:
║   ${rps >= 6000 ? '🏆 EXCELLENT (6000+ RPS)' :
			rps >= 4000 ? '🥇 GREAT (4000+ RPS)' :
				rps >= 2000 ? '🥈 GOOD (2000+ RPS)' :
					rps >= 1000 ? '🥉 AVERAGE (1000+ RPS)' : '❌ NEEDS IMPROVEMENT'}
╚══════════════════════════════════════════════════════════════╝
    `,
	};
}
