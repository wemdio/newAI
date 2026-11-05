FROM python:3.11-slim

WORKDIR /app

# Copy requirements first to cache dependencies
COPY requirements.txt .

# Install dependencies
RUN python -m pip install --no-cache-dir --only-binary=cryptg -r requirements.txt

# Copy the rest of the application code
COPY . .

# Create sessions directory
RUN mkdir -p sessions

# Run the application with unbuffered output
CMD ["python", "-u", "main.py"]

