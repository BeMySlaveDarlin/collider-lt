#!/bin/bash

# Быстрый тест для проверки работоспособности API
# Использование: ./quick-test.sh [base_url]

set -e

BASE_URL=${1:-"http://localhost"}

echo "🚀 Быстрая проверка API Collider"
echo "🌐 Base URL: $BASE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Проверка доступности
echo "🔍 Проверка доступности сервера..."
if curl -sf "$BASE_URL" > /dev/null; then
    echo "✔ Сервер доступен"
else
    echo "❌ Сервер недоступен по адресу $BASE_URL"
    exit 1
fi

# Создаем временный тест
cat > /tmp/quick-api-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

export const options = {
  vus: 1,
  duration: '60s',
};

export default function() {
  // Тест создания события
  const createPayload = {
    user_id: 1,
    event_type: 'test_event',
    timestamp: new Date().toISOString(),
    metadata: { test: true }
  };

  const createResponse = http.post(
    `${BASE_URL}/event`,
    JSON.stringify(createPayload),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(createResponse, {
    'create event: status 201': (r) => r.status === 201,
    'create event: has response': (r) => r.body.length > 0,
  });

  sleep(0.1);

  // Тест получения событий
  const getResponse = http.get(`${BASE_URL}/events?page=1&limit=1000`);

  check(getResponse, {
    'get events: status 200': (r) => r.status === 200,
    'get events: has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      } catch (e) {
        return false;
      }
    },
  });

  sleep(0.1);

  // Тест получения событий пользователя
  const userEventsResponse = http.get(`${BASE_URL}/users/1/events?limit=1000`);

  check(userEventsResponse, {
    'get user events: status 200': (r) => r.status === 200,
  });

  sleep(0.1);

  // Тест статистики
  const statsResponse = http.get(`${BASE_URL}/stats?limit=3`);

  check(statsResponse, {
    'get stats: status 200': (r) => r.status === 200,
    'get stats: has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && typeof body.data === 'object';
      } catch (e) {
        return false;
      }
    },
  });

  sleep(0.5);
}

export function handleSummary(data) {
  const passed = data.metrics.checks.values.passes;
  const failed = data.metrics.checks.values.fails;
  const total = passed + failed;
  const successRate = (passed / total * 100).toFixed(1);

  return {
    stdout: `
╔══════════════════════════════════════════════════════════════╗
║                     БЫСТРАЯ ПРОВЕРКА API                    ║
╠══════════════════════════════════════════════════════════════╣
║ Всего проверок: ${total}
║ Успешных: ${passed} (${successRate}%)
║ Неудачных: ${failed}
║ Среднее время ответа: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms
║ RPS: ${data.metrics.http_reqs.values.rate.toFixed(2)}
║
║ ${successRate >= 80 ? '✔ API работает корректно' : '❌ Обнаружены проблемы с API'}
╚══════════════════════════════════════════════════════════════╝
    `,
  };
}
EOF

echo "⚡ Запуск быстрого теста API..."
if k6 run --verbose --env BASE_URL="$BASE_URL" /tmp/quick-api-test.js; then
    echo "✔ Быстрый тест завершен успешно"
else
    echo "❌ Быстрый тест выявил проблемы"
fi

# Очистка
rm -f /tmp/quick-api-test.js

echo ""
echo "💡 Для полного тестирования запустите:"
echo "   ./run-all-tests.sh $BASE_URL"
