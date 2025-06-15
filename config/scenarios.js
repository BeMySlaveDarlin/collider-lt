export const scenarios = {
	smoke_test: {
		executor: 'constant-vus',
		vus: 1,
		duration: '30s',
		tags: { test_type: 'smoke' },
	},

	load_test: {
		executor: 'ramping-vus',
		startVUs: 0,
		stages: [
			{ duration: '30s', target: 10 },
			{ duration: '2m', target: 10 },
			{ duration: '30s', target: 0 },
		],
		tags: { test_type: 'load' },
	},

	stress_test: {
		executor: 'ramping-vus',
		startVUs: 0,
		stages: [
			{ duration: '30s', target: 20 },
			{ duration: '1m', target: 50 },
			{ duration: '2m', target: 50 },
			{ duration: '30s', target: 0 },
		],
		tags: { test_type: 'stress' },
	},

	spike_test: {
		executor: 'ramping-vus',
		startVUs: 0,
		stages: [
			{ duration: '10s', target: 10 },
			{ duration: '10s', target: 100 },
			{ duration: '10s', target: 10 },
			{ duration: '10s', target: 0 },
		],
		tags: { test_type: 'spike' },
	},

	volume_test: {
		executor: 'constant-vus',
		vus: 30,
		duration: '10m',
		tags: { test_type: 'volume' },
	},

	breakpoint_test: {
		executor: 'ramping-arrival-rate',
		startRate: 10,
		timeUnit: '1s',
		preAllocatedVUs: 10,
		maxVUs: 200,
		stages: [
			{ duration: '30s', target: 10 },
			{ duration: '1m', target: 50 },
			{ duration: '1m', target: 100 },
			{ duration: '1m', target: 150 },
			{ duration: '1m', target: 200 },
			{ duration: '30s', target: 0 },
		],
		tags: { test_type: 'breakpoint' },
	},
};
