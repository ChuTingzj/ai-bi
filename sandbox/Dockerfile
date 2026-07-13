FROM node:20-alpine

WORKDIR /sandbox

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY execute.js ./

# 非 root 用户运行，进一步降低容器内权限
USER node

ENTRYPOINT ["node", "execute.js"]
