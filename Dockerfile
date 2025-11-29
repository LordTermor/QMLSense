FROM node:22-bullseye

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash && \
    cp /root/.bun/bin/bun /usr/local/bin/bun && \
    chmod +x /usr/local/bin/bun && \
    ln -s /usr/local/bin/bun /usr/local/bin/bunx

WORKDIR /app

CMD ["/bin/bash"]