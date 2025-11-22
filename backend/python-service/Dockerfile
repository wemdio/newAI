FROM python:3.11-slim

WORKDIR /app

# Copy requirements first to cache dependencies
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Create sessions directory
RUN mkdir -p sessions

# Run the application with unbuffered output
CMD ["python", "-u", "main.py"]

