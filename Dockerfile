FROM node:20-bullseye

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun globally for all users
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.3" && \
    cp /root/.bun/bin/bun /usr/local/bin/bun && \
    chmod +x /usr/local/bin/bun && \
    ln -s /usr/local/bin/bun /usr/local/bin/bunx

WORKDIR /app

# Default command runs bash
CMD ["/bin/bash"]
