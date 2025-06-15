// Загрузчик данных из CSV файлов для тестов

export function loadCSVData(filePath) {
	try {
		const csvContent = open(filePath);
		return parseCSV(csvContent);
	} catch (e) {
		console.warn(`Failed to load CSV from ${filePath}:`, e.message);
		return [];
	}
}

export function parseCSV(csvContent) {
	const lines = csvContent.trim().split('\n');
	if (lines.length < 2) return [];

	const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
	const data = [];

	for (let i = 1; i < lines.length; i++) {
		const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
		if (values.length === headers.length) {
			const row = {};
			headers.forEach((header, index) => {
				row[header] = values[index];
			});
			data.push(row);
		}
	}

	return data;
}

// Функция для подготовки тестовых данных
export function setupTestData() {
	console.log('📋 Loading test data from CSV files...');

	// Загружаем пользователей
	const users = loadCSVData('./data/users.csv');
	console.log(`👥 Loaded ${users.length} users`);

	// Загружаем типы событий
	const eventTypes = loadCSVData('./data/event_types.csv');
	console.log(`📊 Loaded ${eventTypes.length} event types`);

	return {
		users: users,
		eventTypes: eventTypes
	};
}

// Функция для создания CSV файлов по умолчанию если они не существуют
export function createDefaultCSVFiles() {
	const defaultUsers = generateDefaultUsers();
	const defaultEventTypes = generateDefaultEventTypes();

	console.log('📝 Creating default CSV files...');

	// Для k6 мы не можем писать файлы, поэтому выводим в консоль
	console.log('\n=== users.csv ===');
	console.log('id,name,email');
	defaultUsers.forEach(user => {
		console.log(`${user.id},"${user.name}","${user.email}"`);
	});

	console.log('\n=== event_types.csv ===');
	console.log('id,name,description');
	defaultEventTypes.forEach(type => {
		console.log(`${type.id},"${type.name}","${type.description}"`);
	});

	return { users: defaultUsers, eventTypes: defaultEventTypes };
}

function generateDefaultUsers() {
	const users = [];
	const firstNames = ['Alex', 'Maria', 'John', 'Anna', 'David', 'Sofia', 'Michael', 'Elena', 'James', 'Victoria'];
	const lastNames = ['Smith', 'Johnson', 'Brown', 'Wilson', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris'];

	for (let i = 1; i <= 1000; i++) {
		const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
		const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
		const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;

		users.push({
			id: i,
			name: `${firstName} ${lastName}`,
			email: email
		});
	}

	return users;
}

function generateDefaultEventTypes() {
	const eventTypes = [
		{ id: 1, name: 'click', description: 'User clicked on element' },
		{ id: 2, name: 'page_view', description: 'Page view event' },
		{ id: 3, name: 'scroll', description: 'User scrolled page' },
		{ id: 4, name: 'hover', description: 'Mouse hover over element' },
		{ id: 5, name: 'form_submit', description: 'Form submission' },
		{ id: 6, name: 'download', description: 'File download' },
		{ id: 7, name: 'search', description: 'Search query' },
		{ id: 8, name: 'login', description: 'User login' },
		{ id: 9, name: 'logout', description: 'User logout' },
		{ id: 10, name: 'purchase', description: 'Purchase completed' },
		{ id: 11, name: 'add_to_cart', description: 'Item added to cart' },
		{ id: 12, name: 'remove_from_cart', description: 'Item removed from cart' },
		{ id: 13, name: 'view_product', description: 'Product page viewed' },
		{ id: 14, name: 'share', description: 'Content shared' },
		{ id: 15, name: 'comment', description: 'Comment posted' },
		{ id: 16, name: 'like', description: 'Content liked' },
		{ id: 17, name: 'follow', description: 'User followed' },
		{ id: 18, name: 'unfollow', description: 'User unfollowed' },
		{ id: 19, name: 'notification_open', description: 'Notification opened' },
		{ id: 20, name: 'video_play', description: 'Video started playing' },
	];

	// Генерируем оставшиеся типы до 100
	for (let i = 21; i <= 100; i++) {
		eventTypes.push({
			id: i,
			name: `event_type_${i}`,
			description: `Auto-generated event type ${i}`
		});
	}

	return eventTypes;
}
