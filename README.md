# Нагрузочное тестирование Collider с k6

## 🔄 Ключевые изменения

### Нюансы API тестирования:
- **GET /users/{user_id}/events** - лимит всегда 1000 (не меняется)
- **GET /stats** - самый тяжелый запрос, специальные тесты кеша
- **Данные из CSV** - загрузка users.csv и event_types.csv

### Логика тестирования stats:
3. **Кеш тестирование** - отдельно с кешем и без кеша для /stats
4. **Проверка данных** - сверка количества страниц после POST

## Обзор

Полная среда для нагрузочного тестирования системы аналитики событий Collider с использованием k6. Тесты покрывают все основные сценарии нагрузки с учетом кеширования GET запросов и сброса кеша после POST/DELETE операций.

## Структура проекта

```
k6-tests/
├── config/
│   ├── scenarios.js          # Конфигурации сценариев нагрузки
│   └── thresholds.js         # Пороговые значения для метрик
├── data/                     # CSV данные для тестов
│   ├── users.csv             # 1000 пользователей (ID 1-1000)
│   └── event_types.csv       # 100 типов событий (ID 1-100)
├── tests/
│   ├── scenario-load-create.js      # Load test: Create (RPS)
│   ├── scenario-load-read.js        # Load test: Read (RPS)
│   ├── scenario-create-read.js      # Load test: Create/Read (RPS)
│   ├── scenario-stats-cache.js      # Load test: Stats с кешем и без
│   └── scenario-score.js            # Load test (score)
├── utils/
│   ├── helpers.js            # Вспомогательные функции
│   └── data-loader.js        # Загрузчик CSV данных
├── results/                  # Результаты тестирования
├── run-all-tests.sh         # Запуск всех тестов (ОБНОВЛЕН)
├── quick-test.sh            # Быстрая проверка API
└── monitor-resources.sh     # Мониторинг ресурсов
```

## 🔍 API которые тестируем

### 📝 **POST /event** - Создание события
```json
{
  "user_id": 1-1000,
  "event_type": "click|page_view|scroll|...",
  "timestamp": "2025-06-15T10:30:00Z",
  "metadata": {"page": "/home", "referrer": "..."}
}
```
**Особенность**: Сбрасывает кеш для всех GET запросов

### 📖 **GET /events** - Список событий
```
GET /events?page=1&limit=100
```
**Кешируется**: ✔ Быстрее после первого запроса

### 👤 **GET /users/{user_id}/events** - События пользователя
```
GET /users/123/events?limit=1000
```
**Кешируется**: ✔ **Лимит всегда 1000** (изменение!)

### 📊 **GET /stats** - Статистика (ТЯЖЕЛЫЙ)
```
GET /stats?from=2025-01-01&to=2025-12-31&type=click&limit=5
```
**Кешируется**: ✔ Самый тяжелый запрос, отдельные тесты кеша

## Быстрый старт

### 1. Установка k6
```bash
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### 2. Подготовка данных
```bash
mkdir -p ~/k6-tests/{config,tests,utils,results,data}
cd ~/k6-tests

# CSV файлы создаются автоматически при запуске run-all-tests.sh
# Или создайте вручную:
# data/users.csv - 1000 пользователей
# data/event_types.csv - 100 типов событий
```

### 3. Запуск тестов
```bash
# Быстрая проверка
./quick-test.sh http://localhost

# Полное тестирование (ОБНОВЛЕНО)
./run-all-tests.sh http://localhost
```

## Тестовые сценарии

### 1. Load test: Create (RPS)
```bash
k6 run --env BASE_URL=http://localhost tests/scenario-load-create.js
```
- **Цель**: 100+ RPS создания событий
- **Особенность**: Каждый POST сбрасывает кеш

### 2. Load test: Read (RPS)
```bash
k6 run --env BASE_URL=http://localhost tests/scenario-load-read.js
```
- **Только GET запросы**: `/events`, `/users/{id}/events?limit=1000`, `/stats`
- **Цель**: 160+ RPS чтения
- **Кеш НЕ сбрасывается**: Оптимальные условия для кеша

### 3. Load test: Create/Read (RPS)
```bash
k6 run --env BASE_URL=http://localhost tests/scenario-create-read.js
```
- **Без DELETE**: 30% создание, 70% чтение
- **Цель**: 150+ RPS общий
- **Сброс кеша**: После каждого POST

### 4. Load test: Stats Cache
```bash
k6 run --env BASE_URL=http://localhost tests/scenario-stats-cache.js
```
- **С кешем**: Только GET /stats (быстрые ответы)
- **Без кеша**: POST + GET /stats (медленные ответы)
- **Проверка данных**: Новые страницы появляются в статистике

### 5. Load test (score)
```bash
k6 run --env BASE_URL=http://localhost tests/scenario-score.js
```
- **Скоринг**: A+ (90+), A (80+), B (70+), C (60+), D (<60)

### GET /users/{id}/events
- 🔄 **Лимит всегда 1000** вместо случайных значений
- 👤 **User ID**: Из CSV файла или 1-1000

### GET /stats тестирование
- 🚀 **С кешем**: Только GET запросы, быстрые ответы
- 🐌 **Без кеша**: POST перед каждым GET, медленные ответы
- 📊 **Проверка данных**: Количество страниц в top_pages

### CSV данные
- 👥 **users.csv**: 1000 пользователей с ID, именем, email
- 📊 **event_types.csv**: 100 типов событий с описанием
- 🔄 **Автосоздание**: При отсутствии файлов

## Мониторинг и анализ

### Новые метрики
```bash
# Кеш статистика для /stats
cat results/stats-cache-20241215.json | jq '.metrics.cache_hits.values.count'

# DELETE изолированный
cat results/delete-isolated-20241215.json | jq '.metrcs.deleted_events_count.values'

# Проверка данных
cat results/stats-cache-20241215.json | jq '.metrics.pages_verified.values'
```

### Интерпретация результатов

#### Отличные показатели (A+)
- Create RPS: > 100
- Read RPS (cached): > 160
- Stats cached vs uncached: > 5x разница
- DELETE isolated: > 3 RPS

#### Проблемы для расследования
- Низкий cache hit rate для /stats
- Медленные uncached запросы > 2000ms
- DELETE операции влияют на другие тесты (если запускать вместе)

## Заключение

Обновленная тестовая среда учитывает все нюансы кеширования и обеспечивает:
- ✔ Изолированное тестирование DELETE операций
- ✔ Корректное тестирование кеша для тяжелых /stats запросов
- ✔ Проверку целостности данных после POST операций
- ✔ Реалистичные нагрузки с CSV данными
