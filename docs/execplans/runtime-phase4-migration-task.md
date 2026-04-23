# Runtime 模块（Phase 4）迁移 ExecPlan

本 ExecPlan 是活文档。`Progress`、`Surprises & Discoveries`、`Decision Log`、`Outcomes & Retrospective` 四个章节必须随着工作推进持续更新。

本文件按仓库根目录 `docs/PLANS.md` 维护。

## Purpose / Big Picture

本阶段要把旧仓库 `~/work/github/metacode-node` 的运行时读取能力迁移到当前 Fastify + tRPC 后端，让“运行时应用列表、应用详情、菜单树、页面详情”在新仓库可直接访问，并与旧项目返回结构保持兼容。迁移完成后，调用方可以通过 `runtime` 路由拿到应用与菜单层级数据、视图配置与表单结构，不再依赖 NestJS `GET /api/apps*` 接口。

## Progress

- [x] (2026-04-23 18:02) 完成第 4 阶段范围确认：核对 `MIGRATION_PLAN.md`、旧仓库 `src/runtime/*` 与当前仓库模块结构。
- [x] (2026-04-23 18:05) 创建本 ExecPlan，明确迁移顺序、验证路径和验收标准。
- [x] (2026-04-23 17:53) 新增 `server/src/modules/runtime/{dto.ts,runtime.service.ts,runtime.router.ts,index.ts}` 并完成服务迁移。
- [x] (2026-04-23 17:54) 在 `server/src/rpc/router.ts` 挂载 `runtimeRouter`。
- [x] (2026-04-23 17:56) 新增 `server/test/runtime.test.ts`，覆盖存在/不存在、菜单树层级、视图与表单结构。
- [x] (2026-04-23 17:58) 对变更文件执行 `eslint --fix` 并修复 runtime 相关 TypeScript 问题。
- [x] (2026-04-23 17:58) 运行并记录 `runtime` 模块 server e2e 测试，4 条用例全部通过。

## Surprises & Discoveries

- Observation: 旧 `runtime` 服务里 `findAppItem` 的子表单 (`subForms`) 不是递归表层级，而是根据 `schema_relation.reference_table_id` 动态拼装关联表单。
  Evidence: `~/work/github/metacode-node/src/runtime/runtime.service.ts` 中先查 `schemaRelation` 再按 `referenceTableId` 查表与字段。
- Observation: 旧接口返回中 `form.id` 与 `field.id` 都强制转成字符串，以规避 BigInt 序列化问题。
  Evidence: 旧服务使用 `table.id.toString()`、`f.id.toString()` 构造 DTO。
- Observation: 仓库全量 TypeScript 检查仍会被历史 `.bak` 模块报错阻塞，需要使用目标文件级检查来验证本阶段改动。
  Evidence: `pnpm --filter ./server exec tsc --noEmit` 失败于 `src/modules/file.bak`、`src/modules/tag.bak`、`src/modules/user.bak`。

## Decision Log

- Decision: `runtime` 路由使用 `publicProcedure`，不强制鉴权。
  Rationale: 旧 NestJS `AppController` 未声明鉴权守卫，本阶段保持运行时读取语义一致。
  Date/Author: 2026-04-23 / Codex
- Decision: 继续采用“服务层统一 BigInt 序列化”的做法，确保返回体稳定为字符串 ID。
  Rationale: `AppItem.form`、`schema` 相关字段包含 BigInt，直接返回会触发 JSON/OpenAPI 序列化风险。
  Date/Author: 2026-04-23 / Codex
- Decision: `runtime` DTO 输出 schema 对递归字段使用 `z.array(z.any())`，避免 OpenAPI 转换时因递归结构导致不稳定。
  Rationale: 该仓库启动时会自动生成 OpenAPI 文档，优先保证可启动与行为兼容，再通过 e2e 约束关键结构。
  Date/Author: 2026-04-23 / Codex

## Outcomes & Retrospective

Phase 4 迁移已完成，`runtime` 模块已经在 Fastify + tRPC 可用。当前交付包含：`runtime` 路由（`apps.list/get/listItems/getItem`）、对应 Prisma service 实现、`rpc/router.ts` 挂载、以及覆盖四条关键链路的 `server/test/runtime.test.ts`。  
遗留项是仓库历史 `.bak` 文件的全量类型报错，这些问题与本阶段新增 runtime 模块无关，但会影响全量 `tsc --noEmit`；本次已通过目标文件级类型检查与 runtime e2e 证明迁移结果可用。

## Context and Orientation

当前后端 tRPC 根路由位于 `server/src/rpc/router.ts`，已迁移模块有 `auth` 与 `design`。本次新增模块目录是 `server/src/modules/runtime/`，包含 DTO、service、router 与模块出口。

术语说明：

- 运行时应用：数据库表 `app` 对应的已发布应用基础信息。
- 菜单树：`app_item` 按 `parent_id` 递归构建的层级结构。
- 页面详情：单个 `app_item` 对应的 `app_view` 列表和可选 `schema_table` 表单定义。
- 子表单：由 `schema_relation` 指向的引用表生成的附属表单定义。

## Plan of Work

先迁移数据结构定义：在 `runtime/dto.ts` 定义输入 schema（`appId`、`appItemId`）和输出 schema（`AppDto`、`AppItemSimpleDto`、`AppItemDto`、`AppViewDto`、`AppItemFormDto`）。随后实现 `runtime.service.ts`，把旧仓库 `findApps/findApp/findAppItems/findAppItem` 迁移为 Prisma 查询，并统一做字符串化输出。完成服务后实现 `runtime.router.ts`，提供 `apps.list/get/listItems/getItem` 四个 query 并加 OpenAPI 元信息。最后挂载到 `rpc/router.ts`，补充 `server/test/runtime.test.ts` 验证主流程与异常分支。

## Concrete Steps

在仓库根目录执行：

1. `pnpm eslint --fix server/src/modules/runtime/dto.ts server/src/modules/runtime/runtime.service.ts server/src/modules/runtime/runtime.router.ts server/src/modules/runtime/index.ts server/src/rpc/router.ts server/test/runtime.test.ts`
2. `pnpm --filter ./server exec tsc --noEmit`
3. 若第 2 步受历史 `.bak` 文件影响，执行目标文件级检查：
   `pnpm --filter ./server exec tsc --noEmit --ignoreConfig --target ESNext --module ESNext --moduleResolution bundler --types node --strict --esModuleInterop --isolatedModules --skipLibCheck --resolveJsonModule src/modules/runtime/dto.ts src/modules/runtime/runtime.service.ts src/modules/runtime/runtime.router.ts src/modules/runtime/index.ts src/rpc/router.ts`
4. `pnpm --filter ./server test:e2e test/runtime.test.ts`

## Validation and Acceptance

验收条件：

1. `server/src/rpc/router.ts` 成功挂载 `runtime` 命名空间。
2. 以下接口可通过 tRPC 调用并返回预期结构：
   - `runtime.apps.list`
   - `runtime.apps.get`
   - `runtime.apps.listItems`
   - `runtime.apps.getItem`
3. `server/test/runtime.test.ts` 至少覆盖：
   - 应用存在时可查询列表与详情；
   - 应用不存在时返回 `NOT_FOUND`；
   - 菜单树按 `parentId` 正确嵌套；
   - 页面详情包含 `views`，且有 schema table 时包含 `form + fields + subForms`。
4. 本次新增/改动文件通过 ESLint 与目标文件级 TypeScript 检查。

## Idempotence and Recovery

该迁移仅新增模块和路由挂载，重复执行不会引入重复数据。测试数据由 `runtime.test.ts` 在 `afterAll` 清理；若测试中断，可按 `appId` 删除 `app_view`、`app_item`、`app` 以及关联 `schema_*` 测试记录后重跑。当前阶段不涉及 Prisma schema 变更，无需执行迁移脚本。

## Artifacts and Notes

关键命令执行摘要：

    pnpm eslint --fix server/src/modules/runtime/dto.ts server/src/modules/runtime/runtime.service.ts server/src/modules/runtime/runtime.router.ts server/src/modules/runtime/index.ts server/src/rpc/router.ts server/test/runtime.test.ts
    => 通过

    pnpm --filter ./server exec tsc --noEmit
    => 失败（历史 .bak 报错，非本次 runtime 改动引入）

    pnpm --filter ./server exec tsc --noEmit --ignoreConfig --target ESNext --module ESNext --moduleResolution bundler --types node --strict --esModuleInterop --isolatedModules --skipLibCheck --resolveJsonModule src/modules/runtime/dto.ts src/modules/runtime/runtime.service.ts src/modules/runtime/runtime.router.ts src/modules/runtime/index.ts src/rpc/router.ts
    => 通过（本次迁移文件类型检查通过）

    pnpm --filter ./server test:e2e test/runtime.test.ts
    => 1 file passed, 4 tests passed

## Interfaces and Dependencies

本阶段新增 tRPC 接口：

- `runtime.apps.list`：查询应用列表。
- `runtime.apps.get`：按 `appId` 查询应用详情。
- `runtime.apps.listItems`：按 `appId` 查询菜单树。
- `runtime.apps.getItem`：按 `appId + appItemId` 查询页面详情。

依赖组件：

- `server/src/lib/prisma.ts`（Prisma 查询）
- `server/src/rpc/trpc.ts`（`publicProcedure` 与 `router`）
- `server/src/generated/prisma/enums.ts`（运行时枚举类型）

---

Revision Note (2026-04-23): 初版 Phase 4 ExecPlan，覆盖范围、实施步骤和验收标准。
Revision Note (2026-04-23): 完成 runtime 代码迁移与测试验证，补充类型检查阻塞说明和执行证据。
