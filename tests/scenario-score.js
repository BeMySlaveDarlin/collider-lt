import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { check } from 'k6';
import { BASE_URL, generateEventPayload, getRandomUserId } from '../utils/helpers.js';

// Метрики для скоринга
const overallScore = new Gauge('overall_score');
const createScore = new Gauge('create_score');
const readScore = new Gauge('read_score');
const stabilityScore = new Gauge('stability_score');
const performanceScore = new Gauge('performance_score');

const operationCounts = new Counter('operation_counts');
const operationErrors = new Counter('operation_errors');
const operationSuccesses = new Counter('operation_successes');
const operationDurations = new Trend('operation_durations', true);

export const options = {
	thresholds: {
		'http_req_duration': ['p(95)<150', 'p(99)<400'],
		'http_req_failed': ['rate<0.02'],
		'overall_score': ['value>80'],
		'create_score': ['value>70'],
		'read_score': ['value>85'],
		'stability_score': ['value>80'],
		'performance_score': ['value>75'],
	},
	scenarios: {
		score_test: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '1m', target: 50 },     // Разогрев
				{ duration: '3m', target: 200 },    // Базовая нагрузка
				{ duration: '2m', target: 400 },    // Пиковая нагрузка
				{ duration: '2m', target: 200 },    // Стабилизация
				{ duration: '1m', target: 0 },      // Завершение
			],
		},
	},
};

export default function() {
	const operation = getWeightedOperation();

	switch(operation) {
		case 'create':
			performCreate();
			break;
		case 'read':
			performRead();
			break;
	}
}

function getWeightedOperation() {
	const rand = Math.random();
	if (rand < 0.70) return 'read';     // 70% чтение
	return 'create';                    // 30% создание
}

function performCreate() {
	const payload = generateEventPayload();
	const startTime = Date.now();

	const params = {
		headers: { 'Content-Type': 'application/json' },
		tags: { operation: 'create', endpoint: 'create_event' },
	};

	const response = http.post(`${BASE_URL}/event`, JSON.stringify(payload), params);
	const duration = Date.now() - startTime;

	const success = check(response, {
		'create: status is 201': (r) => r.status === 201,
		'create: response time < 100ms': (r) => r.timings.duration < 100,
		'create: has valid response': (r) => r.body.length > 0,
	});

	operationCounts.add(1, { operation: 'create' });
	operationDurations.add(duration, { operation: 'create' });

	if (success) {
		operationSuccesses.add(1, { operation: 'create' });
	} else {
		operationErrors.add(1, { operation: 'create' });
	}
}

function performRead() {
	const readType = Math.floor(Math.random() * 3);
	let url, endpointName;
	const startTime = Date.now();

	switch(readType) {
		case 0:
			const page = Math.floor(Math.random() * 50) + 1;
			const limit = [10, 50, 100][Math.floor(Math.random() * 3)];
			url = `${BASE_URL}/events?page=${page}&limit=${limit}`;
			endpointName = 'get_events';
			break;

		case 1:
			const userId = getRandomUserId();
			url = `${BASE_URL}/users/${userId}/events?limit=1000`;
			endpointName = 'get_user_events';
			break;

		case 2:
			const statsLimit = [3, 5, 10][Math.floor(Math.random() * 3)];
			url = `${BASE_URL}/stats?limit=${statsLimit}`;
			endpointName = 'get_stats';
			break;
	}

	const params = {
		tags: { operation: 'read', endpoint: endpointName },
	};

	const response = http.get(url, params);
	const duration = Date.now() - startTime;

	const success = check(response, {
		'read: status is 200': (r) => r.status === 200,
		'read: response time < 50ms': (r) => r.timings.duration < 50,
		'read: has data': (r) => r.body.length > 0,
	});

	operationCounts.add(1, { operation: 'read' });
	operationDurations.add(duration, { operation: 'read' });

	if (success) {
		operationSuccesses.add(1, { operation: 'read' });
	} else {
		operationErrors.add(1, { operation: 'read' });
	}
}

export function handleSummary(data) {
	// Расчет скоров на основе производительности
	const totalRequests = data.metrics.http_reqs.values.count;
	const errorRate = data.metrics.http_req_failed.values.rate;
	const avgDuration = data.metrics.http_req_duration.values.avg;
	const p95Duration = data.metrics.http_req_duration.values['p(95)'];
	const rps = data.metrics.http_reqs.values.rate;

	// Скор стабильности (0-100) - основан на error rate и P95
	const stabilityScoreValue = Math.max(0, 100 - (errorRate * 2000) - Math.max(0, (p95Duration - 100) / 5));

	// Скор производительности create операций (0-100) - основан на RPS и времени ответа
	const createRpsScore = Math.min(100, (rps * 0.7 / 60)); // 6000 RPS = 100 points
	const createTimeScore = Math.max(0, 100 - avgDuration); // < 100ms = max points
	const createScoreValue = (createRpsScore + createTimeScore) / 2;

	// Скор производительности read операций (0-100) - должны быть быстрее
	const readRpsScore = Math.min(100, (rps * 0.7 / 80)); // 8000 RPS = 100 points
	const readTimeScore = Math.max(0, 100 - (avgDuration * 2)); // < 50ms = max points
	const readScoreValue = (readRpsScore + readTimeScore) / 2;

	// Общий скор производительности
	const performanceScoreValue = Math.min(100, rps / 60); // 6000 RPS = 100 points

	// Общий скор (взвешенная сумма)
	const overallScoreValue = (
		stabilityScoreValue * 0.25 +    // 25% стабильность
		createScoreValue * 0.25 +       // 25% create производительность
		readScoreValue * 0.25 +         // 25% read производительность
		performanceScoreValue * 0.25    // 25% общая производительность
	);

	// Устанавливаем метрики для отображения в thresholds
	overallScore.add(overallScoreValue);
	createScore.add(createScoreValue);
	readScore.add(readScoreValue);
	stabilityScore.add(stabilityScoreValue);
	performanceScore.add(performanceScoreValue);

	// Определяем рейтинг
	let rating;
	if (overallScoreValue >= 95) rating = 'A+ (Исключительный - 6000+ RPS)';
	else if (overallScoreValue >= 85) rating = 'A (Отличный - 4000+ RPS)';
	else if (overallScoreValue >= 75) rating = 'B (Хороший - 2000+ RPS)';
	else if (overallScoreValue >= 65) rating = 'C (Удовлетворительный - 1000+ RPS)';
	else if (overallScoreValue >= 50) rating = 'D (Плохой - <1000 RPS)';
	else rating = 'F (Неудовлетворительный - критические проблемы)';

	return {
		'results/score-summary.json': JSON.stringify({
			...data,
			scores: {
				overall: overallScoreValue,
				create: createScoreValue,
				read: readScoreValue,
				stability: stabilityScoreValue,
				performance: performanceScoreValue,
				rating: rating,
				rps: rps,
				avgDuration: avgDuration,
				p95Duration: p95Duration,
				errorRate: errorRate * 100
			}
		}),
		stdout: `
╔══════════════════════════════════════════════════════════════╗
║                     LOAD TEST (SCORE)                       ║
╠══════════════════════════════════════════════════════════════╣
║ ОБЩИЙ РЕЙТИНГ: ${rating}
║ 
║ СКОРЫ (0-100):
║   📊 Общий скор: ${overallScoreValue.toFixed(1)}
║   ⚡ Производительность: ${performanceScoreValue.toFixed(1)}
║   ✅ Стабильность: ${stabilityScoreValue.toFixed(1)}
║   📝 Create операции: ${createScoreValue.toFixed(1)}
║   📖 Read операции: ${readScoreValue.toFixed(1)}
║
║ МЕТРИКИ ПРОИЗВОДИТЕЛЬНОСТИ:
║   🚀 RPS: ${rps.toFixed(0)} (Target: 6000+)
║   ⏱️  Avg Response: ${avgDuration.toFixed(1)}ms
║   📈 P95 Response: ${p95Duration.toFixed(1)}ms
║   ❌ Error Rate: ${(errorRate * 100).toFixed(2)}%
║   📦 Total Requests: ${totalRequests}
║
║ ФОРМУЛА СКОРИНГА:
║   • Производительность: RPS/60 (6000 RPS = 100 pts)
║   • Стабильность: 100 - errors*2000 - latency_penalty
║   • Create: (RPS_score + time_score) / 2
║   • Read: (RPS_score + time_score) / 2  
║   • Общий: weighted average (25% каждый)
║
║ РЕКОМЕНДАЦИИ:
║   ${overallScoreValue < 75 ? '🔧 Оптимизировать производительность БД/кеша' : '✅ Производительность отличная'}
║   ${errorRate > 0.02 ? '🔧 Снизить количество ошибок' : '✅ Стабильность хорошая'}
║   ${p95Duration > 150 ? '🔧 Улучшить время отклика' : '✅ Время отклика приемлемое'}
║   ${rps < 3000 ? '🔧 Масштабировать инфраструктуру' : '✅ RPS в норме'}
╚══════════════════════════════════════════════════════════════╝
    `,
	};
}
