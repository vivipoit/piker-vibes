FROM node:20

RUN apt-get update && apt-get install -y \
    git \
    zsh \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
  && chsh -s /usr/bin/zsh node

RUN npm install -g @anthropic-ai/claude-code

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx -y playwright@1.62.1 install --with-deps chromium \
  && chmod -R o+rx /ms-playwright

COPY --chown=node:node .zshrc /home/node/.zshrc

WORKDIR /workspace

USER node
