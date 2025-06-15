import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost';

// Данные будут загружены из CSV перед тестами
export let USERS_DATA = [];
export let EVENT_TYPES_DATA = [];

export function loadUsersData(csvData) {
	USERS_DATA = csvData;
}

export function loadEventTypesData(csvData) {
	EVENT_TYPES_DATA = csvData;
}

export function checkResponse(response, endpoint, expectedStatus = 200) {
	return check(response, {
		[`${endpoint}: status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
		[`${endpoint}: response time < 2s`]: (r) => r.timings.duration < 2000,
		[`${endpoint}: has response body`]: (r) => r.body.length > 0,
	}, { endpoint: endpoint });
}

export function checkApiResponse(response, endpoint) {
	const result = check(response, {
		[`${endpoint}: status is 200 or 201`]: (r) => [200, 201].includes(r.status),
		[`${endpoint}: has data field`]: (r) => {
			try {
				const body = JSON.parse(r.body);
				return body.hasOwnProperty('data');
			} catch (e) {
				return false;
			}
		},
		[`${endpoint}: response time acceptable`]: (r) => r.timings.duration < 5000,
	}, { endpoint: endpoint });

	if (!result) {
		console.error(`${endpoint} failed:`, response.status, response.body);
	}

	return result;
}

export function getRandomUserId() {
	if (USERS_DATA.length > 0) {
		const randomUser = USERS_DATA[Math.floor(Math.random() * USERS_DATA.length)];
		return parseInt(randomUser.id);
	}
	return Math.floor(Math.random() * 1000) + 1;
}

export function getRandomEventType() {
	if (EVENT_TYPES_DATA.length > 0) {
		const randomType = EVENT_TYPES_DATA[Math.floor(Math.random() * EVENT_TYPES_DATA.length)];
		return randomType.name;
	}
	const types = ['click', 'page_view', 'scroll', 'hover', 'form_submit', 'download', 'search'];
	return types[Math.floor(Math.random() * types.length)];
}

export function getRandomMetadata() {
	const pages = ['/home', '/dashboard', '/profile', '/settings', '/search', '/about', '/products', '/contact'];
	const referrers = ['https://google.com', 'https://facebook.com', 'direct', 'https://twitter.com'];

	return {
		page: pages[Math.floor(Math.random() * pages.length)],
		referrer: referrers[Math.floor(Math.random() * referrers.length)],
		user_agent: 'k6-load-test',
		session_id: `session_${Math.random().toString(36).substr(2, 9)}`,
	};
}

export function generateEventPayload() {
	return {
		user_id: getRandomUserId(),
		event_type: getRandomEventType(),
		timestamp: new Date().toISOString(),
		metadata: getRandomMetadata(),
	};
}

export function generateBatchEvents(count = 10) {
	const events = [];
	for (let i = 0; i < count; i++) {
		events.push(generateEventPayload());
	}
	return events;
}

export function formatDuration(ms) {
	if (ms < 1000) return `${ms.toFixed(2)}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
	return `${(ms / 60000).toFixed(2)}m`;
}

export function logTestResult(testName, response) {
	console.log(`[${testName}] Status: ${response.status}, Duration: ${formatDuration(response.timings.duration)}`);
}

// Функция для проверки количества страниц в ответе статистики
export function checkStatsPages(response, expectedPages) {
	try {
		const body = JSON.parse(response.body);
		if (body.data && body.data.top_pages && Array.isArray(body.data.top_pages)) {
			const actualPages = body.data.top_pages.length;
			return check(response, {
				'stats: correct pages count': () => actualPages >= expectedPages,
			});
		}
	} catch (e) {
		return false;
	}
	return false;
}
