#!/bin/bash

# Скрипт мониторинга ресурсов во время нагрузочного тестирования
# Использование: ./monitor-resources.sh [interval_seconds]

INTERVAL=${1:-2}
LOG_FILE="results/resources-$(date +%Y%m%d-%H%M%S).log"

echo "🖥️  Мониторинг ресурсов сервера"
echo "⏱️  Интервал: ${INTERVAL}s"
echo "📝 Лог файл: $LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Создаем директорию если не существует
mkdir -p results

# Заголовок лог файла
cat > "$LOG_FILE" << EOF
# Мониторинг ресурсов сервера
# Дата запуска: $(date)
# Интервал: ${INTERVAL}s
#
# Формат: TIMESTAMP,CPU_USAGE,RAM_USED_MB,RAM_FREE_MB,LOAD_1M,LOAD_5M,LOAD_15M,DISK_USAGE,NETWORK_RX_MB,NETWORK_TX_MB
EOF

echo "TIMESTAMP,CPU_USAGE,RAM_USED_MB,RAM_FREE_MB,LOAD_1M,LOAD_5M,LOAD_15M,DISK_USAGE,NETWORK_RX_MB,NETWORK_TX_MB" >> "$LOG_FILE"

# Функция для получения статистики сети
get_network_stats() {
    local interface=$(ip route | grep default | awk '{print $5}' | head -n1)
    if [ -n "$interface" ]; then
        local rx_bytes=$(cat /sys/class/net/$interface/statistics/rx_bytes 2>/dev/null || echo 0)
        local tx_bytes=$(cat /sys/class/net/$interface/statistics/tx_bytes 2>/dev/null || echo 0)
        # Конвертируем в MB
        local rx_mb=$(echo "scale=2; $rx_bytes / 1024 / 1024" | bc -l 2>/dev/null || echo "0")
        local tx_mb=$(echo "scale=2; $tx_bytes / 1024 / 1024" | bc -l 2>/dev/null || echo "0")
        echo "$rx_mb,$tx_mb"
    else
        echo "0,0"
    fi
}

# Основной цикл мониторинга
echo "📊 Начинаем мониторинг... (Ctrl+C для остановки)"
echo ""

printf "%-19s %8s %12s %12s %8s %8s %8s %10s %10s %10s\n" \
    "TIME" "CPU%" "RAM_USED" "RAM_FREE" "LOAD1" "LOAD5" "LOAD15" "DISK%" "NET_RX" "NET_TX"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

trap 'echo -e "\n🛑 Мониторинг остановлен"; echo "📄 Результаты сохранены в: $LOG_FILE"; exit 0' INT

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # CPU Usage (инвертируем idle для получения usage)
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' | head -n1)
    if [ -z "$CPU_USAGE" ]; then
        CPU_USAGE=$(vmstat 1 2 | tail -1 | awk '{print 100-$15}')
    fi

    # RAM Usage
    RAM_INFO=$(free -m | grep "^Mem:")
    RAM_TOTAL=$(echo $RAM_INFO | awk '{print $2}')
    RAM_USED=$(echo $RAM_INFO | awk '{print $3}')
    RAM_FREE=$(echo $RAM_INFO | awk '{print $7}')

    # Load Average
    LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | sed 's/^ *//')
    LOAD_1M=$(echo $LOAD_AVG | awk -F', ' '{print $1}')
    LOAD_5M=$(echo $LOAD_AVG | awk -F', ' '{print $2}')
    LOAD_15M=$(echo $LOAD_AVG | awk -F', ' '{print $3}')

    # Disk Usage (корневой раздел)
    DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

    # Network Stats
    NETWORK_STATS=$(get_network_stats)
    NET_RX=$(echo $NETWORK_STATS | cut -d',' -f1)
    NET_TX=$(echo $NETWORK_STATS | cut -d',' -f2)

    # Логируем в файл
    echo "$TIMESTAMP,$CPU_USAGE,$RAM_USED,$RAM_FREE,$LOAD_1M,$LOAD_5M,$LOAD_15M,$DISK_USAGE,$NET_RX,$NET_TX" >> "$LOG_FILE"

    # Выводим на экран с цветовым кодированием
    # Красный если CPU > 80%, RAM > 90%, Load > количество ядер
    CPU_COLOR=""
    RAM_COLOR=""
    LOAD_COLOR=""
    RESET="\033[0m"

    if (( $(echo "$CPU_USAGE > 80" | bc -l 2>/dev/null || echo 0) )); then
        CPU_COLOR="\033[91m"  # Красный
    elif (( $(echo "$CPU_USAGE > 60" | bc -l 2>/dev/null || echo 0) )); then
        CPU_COLOR="\033[93m"  # Желтый
    fi

    RAM_USAGE_PERCENT=$(echo "scale=1; $RAM_USED * 100 / $RAM_TOTAL" | bc -l 2>/dev/null || echo "0")
    if (( $(echo "$RAM_USAGE_PERCENT > 90" | bc -l 2>/dev/null || echo 0) )); then
        RAM_COLOR="\033[91m"
    elif (( $(echo "$RAM_USAGE_PERCENT > 75" | bc -l 2>/dev/null || echo 0) )); then
        RAM_COLOR="\033[93m"
    fi

    NPROC=$(nproc)
    if (( $(echo "$LOAD_1M > $NPROC" | bc -l 2>/dev/null || echo 0) )); then
        LOAD_COLOR="\033[91m"
    elif (( $(echo "$LOAD_1M > $(echo "$NPROC * 0.7" | bc -l)" | bc -l 2>/dev/null || echo 0) )); then
        LOAD_COLOR="\033[93m"
    fi

    printf "%-19s ${CPU_COLOR}%7.1f%%${RESET} ${RAM_COLOR}%9.0fMB${RESET} %9.0fMB ${LOAD_COLOR}%7.2f${RESET} %7.2f %7.2f %8.0f%% %8.1fMB %8.1fMB\n" \
        "$TIMESTAMP" "$CPU_USAGE" "$RAM_USED" "$RAM_FREE" "$LOAD_1M" "$LOAD_5M" "$LOAD_15M" "$DISK_USAGE" "$NET_RX" "$NET_TX"

    sleep $INTERVAL
done
