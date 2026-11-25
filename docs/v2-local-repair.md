# V2 工程修复
- 首先执行 node scripts/verify-v2.mjs --install。此入口不继承生产凭据，不执行迁移。
- 在 apps/admin-api/.env.test.local 配置已初始化的隔离 Neon TEST_DATABASE_URL；Windows 执行 start.bat，Mac 执行 sh start-local.sh。使用 18089/18091，正式端口不动。
- 生产入口 npm run start:production 保留；不要在测试模式运行。
- 根目录旧 Dockerfile 和 Compose 是 V1 归档，不适用于 V2；新配置 infra/docker-compose.v2-test.yml 仅用于隔离测试。尚未实际构建。
- 快照缺表即拒绝发布；缓存回调返回值经过检查，真实页面仍需验收。
- 未执行任何迁移。商品详情独立历史、对比、回滚及重复发布覆盖快照仍待实现。
- 历史素材迁移脚本默认禁止运行，暂不删除素材。
