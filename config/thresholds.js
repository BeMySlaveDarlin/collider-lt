export const thresholds = {
	http_req_duration: ['p(95)<500', 'p(99)<1000'],
	http_req_failed: ['rate<0.05'],
	http_reqs: ['rate>50'],
	iteration_duration: ['p(95)<2000'],
	vus: ['value<=100'],
	vus_max: ['value<=100'],
};

export const apiThresholds = {
	'http_req_duration{endpoint:create_event}': ['p(95)<200', 'p(99)<500'],
	'http_req_duration{endpoint:batch_events}': ['p(95)<1000', 'p(99)<2000'],
	'http_req_duration{endpoint:get_events}': ['p(95)<300', 'p(99)<800'],
	'http_req_duration{endpoint:stats}': ['p(95)<500', 'p(99)<1500'],

	'http_req_failed{endpoint:create_event}': ['rate<0.01'],
	'http_req_failed{endpoint:batch_events}': ['rate<0.02'],
	'http_req_failed{endpoint:get_events}': ['rate<0.01'],
	'http_req_failed{endpoint:stats}': ['rate<0.02'],
};

export const performanceThresholds = {
	'http_req_duration{scenario:smoke_test}': ['p(95)<1000'],
	'http_req_duration{scenario:load_test}': ['p(95)<500'],
	'http_req_duration{scenario:stress_test}': ['p(95)<1000'],
	'http_req_duration{scenario:spike_test}': ['p(95)<2000'],
	'http_req_duration{scenario:volume_test}': ['p(95)<800'],

	'http_req_failed{scenario:smoke_test}': ['rate<0.01'],
	'http_req_failed{scenario:load_test}': ['rate<0.02'],
	'http_req_failed{scenario:stress_test}': ['rate<0.05'],
	'http_req_failed{scenario:spike_test}': ['rate<0.10'],
	'http_req_failed{scenario:volume_test}': ['rate<0.03'],
};
