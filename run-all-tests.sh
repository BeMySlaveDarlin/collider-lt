#!/bin/bash

# Скрипт для запуска всех тестовых сценариев k6
# Использование: ./run-all-tests.sh [base_url]

set -e

BASE_URL=${1:-"http://localhost"}
RESULTS_DIR="results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "🚀 Запуск нагрузочного тестирования для Collider"
echo "🌐 Base URL: $BASE_URL"
echo "📁 Results dir: $RESULTS_DIR"
echo "🕐 Timestamp: $TIMESTAMP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Создаем директорию для результатов
mkdir -p $RESULTS_DIR

# Проверяем доступность сервера
echo "🔍 Проверка доступности сервера..."
if ! curl -sf "$BASE_URL" > /dev/null; then
    echo "❌ Сервер недоступен по адресу $BASE_URL"
    exit 1
fi
echo "✅ Сервер доступен"

# Создаем CSV файлы с данными если их нет
echo "📋 Подготовка тестовых данных..."
mkdir -p data

if [ ! -f "data/users.csv" ]; then
    echo "📝 Создание data/users.csv..."
    echo "id,name,email" > data/users.csv
    for i in {1..1000}; do
        echo "$i,User_${i},user${i}@example.com" >> data/users.csv
    done
fi

if [ ! -f "data/event_types.csv" ]; then
    echo "📝 Создание data/event_types.csv..."
    echo "id,name,description" > data/event_types.csv
    types=("click" "page_view" "scroll" "hover" "form_submit" "download" "search" "login" "logout" "purchase")
    for i in {1..100}; do
        if [ $i -le 10 ]; then
            type_name=${types[$((i-1))]}
            echo "$i,$type_name,${type_name} event description" >> data/event_types.csv
        else
            echo "$i,event_type_${i},Auto-generated event type ${i}" >> data/event_types.csv
        fi
    done
fi

echo "✅ Тестовые данные готовы"

# Функция для запуска теста
run_test() {
    local test_name=$1
    local test_file=$2
    local description=$3

    echo ""
    echo "📊 [$test_name] $description"
    echo "⏳ Запуск: $test_file"

    if k6 run \
        --env BASE_URL="$BASE_URL" \
        --out json="$RESULTS_DIR/${test_name}-${TIMESTAMP}.json" \
        "$test_file"; then
        echo "✅ [$test_name] Тест завершен успешно"
    else
        echo "❌ [$test_name] Тест завершен с ошибками"
    fi
}

# Запуск тестов по обновленным сценариям (БЕЗ DELETE)
run_test "create" "tests/scenario-load-create.js" "Load test: Create (RPS) - Target: 3000+"

sleep 10

run_test "read" "tests/scenario-load-read.js" "Load test: Read (RPS) - Target: 4000+"

sleep 10

run_test "create-read" "tests/scenario-create-read.js" "Load test: Create/Read (RPS) - смешанная нагрузка"

sleep 10

run_test "stats-cache" "tests/scenario-stats-cache.js" "Load test: Stats с кешем и без кеша"

sleep 10

run_test "score" "tests/scenario-score.js" "Load test (score) - общая оценка производительности"

echo ""
echo "🎉 Все тесты завершены!"
echo "📋 Результаты сохранены в директории: $RESULTS_DIR"

# Создаем итоговый отчет
echo ""
echo "📈 Создание итогового отчета..."

cat > "$RESULTS_DIR/summary-${TIMESTAMP}.md" << EOF
# Отчет по нагрузочному тестированию Collider

**Дата:** $(date)
**Сервер:** $BASE_URL
**Timestamp:** $TIMESTAMP

## Изменения в тестах

### ✅ Обновленные требования:
- **DELETE /events** - сбрасывает кеш, тестируется ИЗОЛИРОВАННО
- **GET /users/{id}/events** - лимит всегда 1000
- **GET /stats** - отдельные тесты с кешем и без кеша
- **Данные из CSV** - users.csv и event_types.csv

### 🧪 Выполненные тесты:

1. **Load test: Create (RPS)** - Тестирование создания событий
2. **Load test: Read (RPS)** - Тестирование чтения с кешированием (без POST)
3. **Load test: Delete (RPS)** - Изолированное тестирование удаления
4. **Load test: Create/Read (RPS)** - Смешанная нагрузка (без DELETE)
5. **Load test: Stats Cache** - Тестирование кеша для /stats
6. **Load test (score)** - Скоринговый тест производительности

## Файлы результатов

EOF

ls -la "$RESULTS_DIR"/*-${TIMESTAMP}.json 2>/dev/null | while read line; do
    filename=$(basename "$line")
    echo "- \`$filename\`" >> "$RESULTS_DIR/summary-${TIMESTAMP}.md"
done

echo ""
echo "📄 Итоговый отчет: $RESULTS_DIR/summary-${TIMESTAMP}.md"
echo ""
echo "🔧 Для анализа результатов используйте:"
echo "   cat $RESULTS_DIR/create-${TIMESTAMP}.json | jq '.metrics.http_reqs.values.rate'"
echo "   cat $RESULTS_DIR/stats-cache-${TIMESTAMP}.json | jq '.scores // .metrics'"
echo ""
echo "📊 Ключевые изменения:"
echo "   • DELETE тестируется отдельно с прогрессивными датами"
echo "   • GET /stats с проверкой кеша и данных после POST"
echo "   • Данные загружаются из CSV файлов"
echo "   • Все user_events запросы с limit=1000"
echo ""
echo "✨ Готово!"#!/bin/bash

# Скрипт для запуска всех тестовых сценариев k6
# Использование: ./run-all-tests.sh [base_url]

set -e

BASE_URL=${1:-"http://localhost"}
RESULTS_DIR="results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "🚀 Запуск нагрузочного тестирования для Collider"
echo "🌐 Base URL: $BASE_URL"
echo "📁 Results dir: $RESULTS_DIR"
echo "🕐 Timestamp: $TIMESTAMP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Создаем директорию для результатов
mkdir -p $RESULTS_DIR

# Проверяем доступность сервера
echo "🔍 Проверка доступности сервера..."
if ! curl -sf "$BASE_URL" > /dev/null; then
    echo "❌ Сервер недоступен по адресу $BASE_URL"
    exit 1
fi
echo "✅ Сервер доступен"

# Функция для запуска теста
run_test() {
    local test_name=$1
    local test_file=$2
    local description=$3

    echo ""
    echo "📊 [$test_name] $description"
    echo "⏳ Запуск: $test_file"

    if k6 run \
        --env BASE_URL="$BASE_URL" \
        --out json="$RESULTS_DIR/${test_name}-${TIMESTAMP}.json" \
        "$test_file"; then
        echo "✅ [$test_name] Тест завершен успешно"
    else
        echo "❌ [$test_name] Тест завершен с ошибками"
    fi
}

# Запуск тестов по сценариям
run_test "create" "tests/scenario-load-create.js" "Load test: Create (RPS)"

sleep 10

run_test "read" "tests/scenario-load-read.js" "Load test: Read (RPS)"

sleep 10

run_test "delete" "tests/scenario-load-delete.js" "Load test: Delete (RPS)"

sleep 10

run_test "create-read" "tests/scenario-create-read.js" "Load test: Create/Read (RPS)"

sleep 10

run_test "full-load" "tests/scenario-full-load.js" "Load test: Delete/Create/Read (RPS)"

sleep 10

run_test "score" "tests/scenario-score.js" "Load test (score)"

echo ""
echo "🎉 Все тесты завершены!"
echo "📋 Результаты сохранены в директории: $RESULTS_DIR"

# Создаем итоговый отчет
echo ""
echo "📈 Создание итогового отчета..."

cat > "$RESULTS_DIR/summary-${TIMESTAMP}.md" << EOF
# Отчет по нагрузочному тестированию

**Дата:** $(date)
**Сервер:** $BASE_URL
**Timestamp:** $TIMESTAMP

## Выполненные тесты

1. **Load test: Create (RPS)** - Тестирование создания событий
2. **Load test: Read (RPS)** - Тестирование чтения данных с кешированием
3. **Load test: Delete (RPS)** - Тестирование удаления событий
4. **Load test: Create/Read (RPS)** - Смешанная нагрузка создание/чтение
5. **Load test: Delete/Create/Read (RPS)** - Полная смешанная нагрузка
6. **Load test (score)** - Скоринговый тест производительности

## Файлы результатов

EOF

ls -la "$RESULTS_DIR"/*-${TIMESTAMP}.json | while read line; do
    filename=$(basename "$line")
    echo "- \`$filename\`" >> "$RESULTS_DIR/summary-${TIMESTAMP}.md"
done

echo ""
echo "📄 Итоговый отчет: $RESULTS_DIR/summary-${TIMESTAMP}.md"
echo ""
echo "🔧 Для анализа результатов используйте:"
echo "   cat $RESULTS_DIR/create-${TIMESTAMP}.json | jq '.metrics.http_reqs.values.rate'"
echo "   cat $RESULTS_DIR/score-${TIMESTAMP}.json | jq '.scores'"
echo ""
echo "✨ Готово!"
