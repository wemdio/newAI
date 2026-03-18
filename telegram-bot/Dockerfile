FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# System trust store (needed for custom/self-signed CAs)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Optional custom CAs: drop .crt files into ./certs
COPY certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

COPY bot /app/bot
COPY migrations /app/migrations
COPY supabase_rules.json /app/supabase_rules.json

CMD ["python", "-m", "bot"]
