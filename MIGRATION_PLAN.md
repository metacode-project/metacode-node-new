# metacode-node（NestJS）迁移到 Fastify + tRPC 执行计划

## 背景与范围

目标是在当前仓库（已基于 `trpc-fastify-starter` 初始化）中，完成 `metacode-node` 服务端能力迁移，覆盖以下核心业务模块：

- Auth（登录、刷新、当前用户）
- Design（应用设计与发布）
- Runtime（运行时应用读取）
- App-Template（模板管理与套用）
- 基础设施（BigInt、错误处理、日志、文件上传）

迁移原则：

1. 业务行为与旧项目保持一致（接口语义一致，数据结构兼容）。
2. 框架层改为 Fastify + tRPC + Zod（移除 NestJS 运行时依赖）。
3. 以可回归测试为交付标准（每个模块有独立 server e2e 测试）。

---

## 目录结构

### 新仓库目录结构设计

```txt
server/
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ src/
│  ├─ app.ts
│  ├─ index.ts
│  ├─ lib/
│  │  ├─ auth.ts
│  │  ├─ prisma.ts
│  │  ├─ logger.ts              # 新增（Phase 6）
│  │  ├─ errors.ts              # 新增（Phase 6）
│  │  └─ bigint.ts              # 新增（Phase 6）
│  ├─ rpc/
│  │  ├─ trpc.ts
│  │  ├─ context.ts
│  │  └─ router.ts
│  └─ modules/
│     ├─ auth/
│     │  ├─ auth.router.ts
│     │  ├─ auth.service.ts
│     │  ├─ dto.ts
│     │  └─ index.ts
│     ├─ design/
│     │  ├─ design.router.ts
│     │  ├─ design.service.ts
│     │  ├─ dto.ts
│     │  └─ index.ts
│     ├─ runtime/
│     │  ├─ runtime.router.ts
│     │  ├─ runtime.service.ts
│     │  ├─ dto.ts
│     │  └─ index.ts
│     ├─ app-template/
│     │  ├─ app-template.router.ts
│     │  ├─ app-template.service.ts
│     │  ├─ dto.ts
│     │  └─ index.ts
│     └─ file/
│        └─ ...                 # 复用并增强（Phase 6）
└─ test/
   ├─ auth.test.ts
   ├─ design.test.ts
   ├─ runtime.test.ts
   ├─ app-template.test.ts
   └─ file.test.ts
```

### 保留文件清单（保留并改造）

- `server/src/app.ts`
- `server/src/index.ts`
- `server/src/lib/prisma.ts`
- `server/src/lib/auth.ts`
- `server/src/rpc/context.ts`
- `server/src/rpc/trpc.ts`
- `server/src/rpc/router.ts`
- `server/prisma.config.ts`
- `server/prisma/schema.prisma`（内容整体替换为旧项目模型）
- `server/src/modules/file/*`（作为文件上传能力基础）

### 删除文件清单（starter 示例代码）

- `server/src/modules/tag/*`
- `server/src/modules/sub/*`
- `server/src/modules/user/*`（若仅为 starter 示例）
- `server/test/tag.test.ts`

### 新建文件清单

- `server/src/modules/design/*`
- `server/src/modules/runtime/*`
- `server/src/modules/app-template/*`
- `server/test/design.test.ts`
- `server/test/runtime.test.ts`
- `server/test/app-template.test.ts`
- `server/src/lib/logger.ts`
- `server/src/lib/errors.ts`
- `server/src/lib/bigint.ts`

---

## Phase 1: 基础骨架 ✅ 完成

### 目标

建立可承载旧业务的 Fastify + tRPC 运行骨架，完成数据库模型、鉴权基础、服务入口统一。

### 完成状态

| 任务               | 状态 | 备注                                                        |
| ------------------ | ---- | ----------------------------------------------------------- |
| package.json 调整  | ✅   | 替换为 metacode-node 依赖，pnpm workspace 简化为只有 server |
| schema.prisma 替换 | ✅   | 直接复制 metacode-node 的 schema                            |
| prisma.config.ts   | ✅   | 使用 @prisma/config 的 defineConfig                         |
| lib/prisma.ts      | ✅   | 保持单例，适配 Prisma 7 + MariaDB adapter                   |
| app.ts + index.ts  | ✅   | CORS/JWT/TRPC/Scalar API 文档已注册                         |
| lib/auth.ts        | ✅   | md5Credential, hashPassword, JWT 常量                       |
| router.ts 骨架     | ✅   | health + auth 两个 route                                    |
| db:generate        | ✅   | Prisma Client 生成到 src/generated/prisma                   |
| 健康检查测试       | ✅   | GET /rpc/health 返回 { message: 'ok' }                      |

### 关键实现细节

- Prisma 7 要求 datasource url 不写在 schema.prisma 中，改为 `prisma.config.ts` 的 `datasource.url`
- JWT payload 包含 `sub`(user.id), `username`, `accountId`
- `ctx.user` 在 context 中解析，仅含 `{ id, username, accountId }`，完整用户信息在 service 层从 db 查询

---

## Phase 2: Auth 模块迁移 ✅ 完成

### 目标

完整迁移旧系统认证流程：`login`、`refresh`、`user`，并兼容旧密码哈希逻辑与 refresh cookie 机制。

### 完成状态

| 任务            | 状态    | 备注                                                  |
| --------------- | ------- | ----------------------------------------------------- |
| auth/dto.ts     | ✅      | loginInputSchema, userOutputSchema, loginOutputSchema |
| auth.service.ts | ✅      | loginByPassword, getUserByToken, buildCurrentUserDto  |
| auth.router.ts  | ✅      | login, refresh, me 三个 procedure                     |
| context.ts      | ✅      | JWT payload 解析，ctx.user 注入                       |
| e2e 测试        | ⏳ 待做 | 尚未编写                                              |

### 关键实现细节

- 密码校验：`md5(username + password)` → BigInt hex 字符串（与 Java 后端一致）
- 账号查询链路：`auth_credential.identifier` → `account.id` → `account.user[0]`
- `getUserByToken` 解析 JWT payload（不重验，因为 authedProcedure 已验过）
- 服务端口：2023，监听 0.0.0.0
- 数据库：本地 MySQL `metacode-node`，Prisma db push 已同步 schema

### 测试结果（2026-04-22）

```
POST /rpc/auth.login → 200 ✓（返回 token + refreshToken + user）
GET  /rpc/auth.me   → 200 ✓（带 Bearer Token）
GET  /rpc/health    → 200 ✓
```

export async function login(input: LoginInput, jwt: FastifyJWT) {
const credential = await prisma.authCredential.findFirst({
where: { identifier: input.username },
include: { account: { include: { user: true } } },
})

if (!credential || credential.credential !== legacyCredentialHash(input.username, input.password)) {
throw new TRPCError({ code: 'UNAUTHORIZED', message: '用户名或密码错误' })
}
// ...build current user dto
}

````

```ts
// server/src/modules/auth/auth.router.ts（片段）
login: publicProcedure.input(loginInputSchema).mutation(async ({ ctx, input }) => {
  const result = await login(input, ctx.req.server.jwt)
  ctx.res.setCookie('refreshToken', result.refreshToken, {
    path: '/',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60,
    sameSite: 'lax',
  })
  return result.user
})
````

---

## Phase 3: Design 模块迁移

### 目标

将 `design.controller + design.service` 的设计态 API（应用、分支、页面、视图、权限、部署）完整迁移到 tRPC。

### 任务清单

1. 新建 `design/dto.ts`（Zod + 类型导出）
   - 按资源分组：`app`、`branch`、`item`、`view`、`dataAuthorization`、`deployment`。
2. 新建 `design.service.ts`
   - 迁移 `findApps/findAppByAppId/createApp/updateApp/deleteApp`。
   - 迁移分支复制逻辑（`createAppBranch`）与视图历史恢复。
   - 迁移部署逻辑（`deployApp`）与回滚（`restoreApp`）。
   - 保留 `snapshot` 结构：`appDefinition + itemDefinitions + viewDefinitions + authDefinitions + permissionControls + schema`。
3. 新建 `design.router.ts`
   - 建议 procedure 分组：
     - `apps.list/get/version/create/update/delete`
     - `branches.list/create/update/delete`
     - `items.list/get/create/update/patch/delete`
     - `views.list/get/history/restore/create/update/delete`
     - `dataAuthorizations.list/get/create/update/delete`
     - `deployment.create/history/restore`
4. 所有写操作改为事务保护（特别是 deploy/restore）。
5. 增加 `server/test/design.test.ts`
   - 覆盖 app 全生命周期、branch 克隆、view history restore、deploy + restore。

### 预估工时

- 24 ~ 36 小时（迁移主体）

### 代码示例

```ts
// server/src/modules/design/design.router.ts（片段）
export const designRouter = router({
  apps: router({
    list: authedProcedure.query(() => designService.findApps()),
    get: authedProcedure
      .input(appIdSchema)
      .query(({ input }) => designService.findAppByAppId(input.appId)),
    create: authedProcedure
      .input(createAppSchema)
      .mutation(({ input }) => designService.createApp(input)),
  }),
  deployment: router({
    create: authedProcedure
      .input(deploySchema)
      .mutation(({ input }) =>
        designService.deployApp(
          input.appId,
          input.branchId,
          input.remark,
          input.version,
        ),
      ),
  }),
});
```

```ts
// snapshot BigInt 安全序列化（片段）
const configuration = JSON.stringify(snapshot, (_, value) =>
  typeof value === "bigint" ? value.toString() : value,
);
```

---

## Phase 4: Runtime 模块迁移

### 目标

迁移运行时读取 API（应用列表、应用详情、菜单树、页面详情），保证前端运行时数据可无缝切换。

### 任务清单

1. 新建 `runtime/dto.ts`
   - `AppDto`、`AppItemSimpleDto`、`AppItemDto`、`AppViewDto`、`AppItemFormDto`。
2. 新建 `runtime.service.ts`
   - 迁移 `findApps/findApp/findAppItems/findAppItem`。
   - 保留 app item 树构建与 form/subForms 逻辑。
3. 新建 `runtime.router.ts`
   - `apps.list/get/listItems/getItem` 四个 query。
4. 增加 `server/test/runtime.test.ts`
   - 覆盖应用存在/不存在、菜单树层级、视图与表单结构完整性。

### 预估工时

- 8 ~ 12 小时

### 代码示例

```ts
// server/src/modules/runtime/runtime.service.ts（片段）
function buildTree(
  items: AppItemRow[],
  parentId: string | null,
): RuntimeItem[] {
  return items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      id: item.id,
      name: item.name ?? "",
      type: item.type!,
      children: buildTree(items, item.id),
    }));
}
```

---

## Phase 5: App-Template 模块迁移

### 目标

迁移模板管理与模板套用能力，支持从部署历史创建模板、模板分页查询、模板应用时克隆 schema 与设计态定义。

### 任务清单

1. 新建 `app-template/dto.ts`
   - `create/update/query/apply` 输入 schema 与分页输出 schema。
2. 新建 `app-template.service.ts`
   - 迁移 `createFromHistory/findAll/findCategories/findOne/update/remove/applyTemplate`。
   - 保留 `idMapping` 逻辑和 `cloneSchema`（table/field/index/relation）。
3. 新建 `app-template.router.ts`
   - `create/list/categories/detail/update/delete/apply`。
4. 所有 apply 操作放入事务，避免部分成功。
5. 增加 `server/test/app-template.test.ts`
   - 覆盖 create from history、分页筛选、apply 成功与配置异常失败。

### 预估工时

- 16 ~ 24 小时

### 代码示例

```ts
// server/src/modules/app-template/app-template.service.ts（片段）
const idMapping = {
  appId: new Map([[config.appDefinition.appId, randomUUID()]]),
  appDefinitionId: new Map([[config.appDefinition.id, randomUUID()]]),
  tableId: new Map<string, string>(),
  fieldId: new Map<string, string>(),
};

await prisma.$transaction(async (tx) => {
  const newSchemaId = config.schema
    ? await cloneSchema(config.schema, idMapping, dto.tenantId, tx)
    : null;
  await createAppFromConfig(config, idMapping, dto, newSchemaId, tx);
});
```

---

## Phase 6: 中间件 & 基础设施

### 目标

统一跨模块基础能力，保证线上可观测性与稳定性，包括 BigInt 处理、错误处理、日志、文件上传。

### 任务清单

1. BigInt 处理
   - 增加 `lib/bigint.ts`：统一 `bigint -> string` 序列化工具。
   - DTO 输出层统一字符串 ID（避免 OpenAPI/JSON 序列化异常）。
2. 错误处理
   - 在 `lib/errors.ts` 建立 Prisma 错误到 tRPC 错误码映射（如 `P2002 -> CONFLICT`）。
   - 在 `rpc/trpc.ts` 的 `errorFormatter` 增加标准错误结构。
3. 日志
   - 新增 `lib/logger.ts`，接入 Pino。
   - `app.ts` 启动时启用 request-id 和慢请求日志。
4. 文件上传
   - 使用 `@fastify/multipart` + 现有 `modules/file`。
   - 校准上传策略（base64 和 stream 至少保留一种稳定方案）。
   - 与 `storage_file` / 对象存储（OSS/MinIO）一致化。
5. 测试与检查
   - 增加 `server/test/file.test.ts` 的上传、签名 URL、文件读取验证。
   - 完整执行 lint + 类型检查 + server e2e。

### 预估工时

- 12 ~ 18 小时

### 代码示例

```ts
// server/src/lib/errors.ts（片段）
export function mapPrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new TRPCError({ code: "CONFLICT", message: "数据唯一性冲突" });
    }
  }
  return null;
}
```

```ts
// server/src/rpc/trpc.ts（片段）
errorFormatter({ error, shape }) {
  return {
    ...shape,
    data: {
      ...shape.data,
      prismaCode: error.cause instanceof Prisma.PrismaClientKnownRequestError
        ? error.cause.code
        : null,
    },
  }
}
```

---

## 风险点 & 缓解方案

1. **BigInt 与 JSON 序列化冲突**
   - 风险：部署快照、OpenAPI 输出、日志打印出现序列化失败。
   - 缓解：统一 `serializeBigInt`，对外 DTO 统一 string。

2. **旧密码算法兼容性**
   - 风险：登录全部失败（hash 规则不一致）。
   - 缓解：先复刻旧 `md5(username + password)`，新增回归测试后再考虑升级算法。

3. **Design 部署/恢复的事务一致性**
   - 风险：中途失败造成定义态与运行态数据不一致。
   - 缓解：`deploy/restore/applyTemplate` 全部 `prisma.$transaction`。

4. **ID 类型混用（UUID/String/BigInt）**
   - 风险：Prisma 写入报错或关联断裂。
   - 缓解：建立统一转换函数：`toBigIntId/toStringId`，禁止散落转换。

5. **文件上传链路环境依赖高**
   - 风险：OSS/MinIO 配置缺失导致启动即失败。
   - 缓解：增加 `memory` fallback；启动时输出明确告警。

6. **接口数量多导致回归遗漏**
   - 风险：Design 30+ 接口迁移后存在行为偏差。
   - 缓解：按资源域拆分测试文件并引入最小 fixture 数据集。

---

## 验收标准

1. **模块能力完整**
   - Auth、Design、Runtime、App-Template 四个模块均可通过 tRPC 调用。
   - `rpc/router.ts` 中已挂载对应模块路由。

2. **业务行为一致**
   - Auth 登录、刷新、获取用户行为与旧项目一致（含 refresh cookie）。
   - Design 的 deploy/restore、view history restore 行为与旧项目一致。
   - Runtime 输出结构满足旧前端依赖字段。
   - App-Template 支持从历史创建模板并成功 apply。

3. **基础设施达标**
   - BigInt 输出无序列化错误。
   - Prisma 常见异常可读化。
   - 文件上传、签名 URL、下载链路可用。

4. **自动化验证通过**
   - `pnpm eslint --fix server/src/**/*.ts`
   - `pnpm --filter ./server build`
   - `pnpm --filter ./server test:e2e`
   - 关键模块测试文件全部通过：`auth/design/runtime/app-template/file`

5. **交付结果可观测**
   - 服务启动后 `http://localhost:2023/doc` 可见 API 文档。
   - 关键流程可通过测试脚本或 tRPC 客户端示例复现。

---

## 总工时预估（建议）

- Phase 1：8~12h
- Phase 2：10~14h
- Phase 3：24~36h
- Phase 4：8~12h
- Phase 5：16~24h
- Phase 6：12~18h

**合计：78~116 小时（约 2~3 周，1 名工程师）**
