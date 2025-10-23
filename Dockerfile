# Use Python 3.11 slim image as base
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99

# Install system dependencies
RUN apt-get update && apt-get install -y \
    # Chrome dependencies
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    # Virtual display
    xvfb \
    # Utilities
    unzip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome
# Download and install Chrome GPG key (new method for Debian/Ubuntu)
RUN wget -q -O /tmp/google-chrome-key.pub https://dl-ssl.google.com/linux/linux_signing_key.pub \
    && gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg /tmp/google-chrome-key.pub \
    && rm /tmp/google-chrome-key.pub

# Add Chrome repository with signed-by key
RUN echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list

# Install Chrome
RUN apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY nse_selenium_scraper.py .

# Create downloads directory
RUN mkdir -p /app/downloads

# Create a non-root user to run the application
RUN useradd -m -u 1000 scraper && \
    chown -R scraper:scraper /app

# Switch to non-root user
USER scraper

# Set the entrypoint
ENTRYPOINT ["python", "nse_selenium_scraper.py"]

# Default command (can be overridden)
CMD ["--help"]