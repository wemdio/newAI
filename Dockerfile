FROM python:3.11-slim

WORKDIR /app

# Копируем requirements из подпапки
COPY backend/python-service/requirements.txt .

# Устанавливаем зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код сервиса
COPY backend/python-service/ .

# Создаем папку для сессий
RUN mkdir -p sessions

# Запускаем
CMD ["python", "-u", "main.py"]
