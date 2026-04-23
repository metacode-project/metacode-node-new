# App-Template 模块（Phase 5）迁移 ExecPlan

本 ExecPlan 是活文档。`Progress`、`Surprises & Discoveries`、`Decision Log`、`Outcomes & Retrospective` 四个章节必须随着工作推进持续更新。

本文件按仓库根目录 `docs/PLANS.md` 维护。

## Purpose / Big Picture

本阶段目标是把旧仓库 `~/work/github/metacode-node` 的 `app-template`（应用模板）能力迁移到当前 Fastify + tRPC 后端，让调用方可以在新仓库中完成模板创建、分页查询、分类查询、详情、更新、删除和模板套用。迁移完成后，模板可直接复用 `design.deploy` 产生的快照结构，支持从部署历史快速派生新应用定义。

## Progress

- [x] (2026-04-23 18:24) 确认第 5 阶段边界：对齐 `MIGRATION_PLAN.md`、旧仓库 `src/app-template/*`、当前 `schema.prisma`。
- [x] (2026-04-23 18:26) 创建本 ExecPlan，明确迁移范围、执行顺序和验收标准。
- [x] (2026-04-23 18:33) 新增 `server/src/modules/app-template/{dto.ts,app-template.service.ts,app-template.router.ts,index.ts}` 并完成服务迁移。
- [x] (2026-04-23 18:33) 在 `server/src/rpc/router.ts` 挂载 `appTemplateRouter`。
- [x] (2026-04-23 18:34) 新增 `server/test/app-template.test.ts`，覆盖 create/list/categories/detail/update/delete/applyTemplate 与异常路径。
- [x] (2026-04-23 18:35) 对本次变更文件执行 `eslint --fix` 并修复类型问题。
- [x] (2026-04-23 18:36) 执行目标文件级 TypeScript 检查通过。
- [x] (2026-04-23 18:38) 运行 `pnpm --filter ./server test:e2e test/app-template.test.ts`，3 条用例全部通过。

## Surprises & Discoveries

- Observation: tRPC router 保留关键字不允许 procedure 名为 `apply`。
  Evidence: 首次跑 `app-template.test.ts` 时抛错 `Reserved words used in router({}) call: apply`。
- Observation: 仓库全量 `tsc --noEmit` 仍被历史 `.bak` 模块阻塞。
  Evidence: `src/modules/file.bak`、`src/modules/tag.bak`、`src/modules/user.bak` 持续报错，与本次 app-template 迁移无关。
- Observation: 当前 `design.deployApp` 生成的快照结构与旧仓库 app-template 所需结构一致，可直接解析并套用。
  Evidence: `design.service.ts` 的 `snapshot` 字段包含 `appDefinition/itemDefinitions/viewDefinitions/authDefinitions/permissionControls/schema`。

## Decision Log

- Decision: 第 5 阶段只迁移后端 app-template 模块与 server e2e，不扩展前端页面。
  Rationale: 用户要求迁移 `MIGRATION_PLAN.md` 的第 5 阶段；该阶段定义仅包含后端模块与测试。
  Date/Author: 2026-04-23 / Codex
- Decision: app-template 路由使用 `authedProcedure`。
  Rationale: 模板创建/套用属于设计态管理操作，与 `design` 模块权限等级一致。
  Date/Author: 2026-04-23 / Codex
- Decision: 套用接口 procedure 名称使用 `applyTemplate`（非 `apply`）。
  Rationale: `apply` 是 tRPC router 保留词，会导致服务启动与测试失败。
  Date/Author: 2026-04-23 / Codex
- Decision: apply 全流程放入单事务，并在服务层统一做字符串/BigInt 归一化。
  Rationale: apply 涉及跨表克隆（`md_*` + `schema_*`），事务可避免部分成功。
  Date/Author: 2026-04-23 / Codex

## Outcomes & Retrospective

Phase 5 已完成迁移并通过回归验证。已交付：

1. 新增 `app-template` 模块（`dto/service/router/index`）并挂载到 tRPC 根路由。
2. 迁移模板主流程：`createFromHistory/findAll/findCategories/findOne/update/remove/applyTemplate`。
3. 保留并实现了 `idMapping + schema 克隆 + 事务套用`。
4. 新增 `server/test/app-template.test.ts`，覆盖模板生命周期、套用成功与配置异常失败。

遗留项：全仓 `tsc --noEmit` 的 `.bak` 历史模块报错未处理（本次范围外），已通过目标文件级检查证明本次改动可编译。

## Context and Orientation

当前仓库后端入口为 `server/src/app.ts`，tRPC 根路由在 `server/src/rpc/router.ts`。已完成迁移模块包括 `auth`、`design`、`runtime`。本次新增目录是 `server/src/modules/app-template/`。

术语说明：

- 模板（template）：`md_app_template` 表记录，`configuration` 保存完整应用快照。
- 套用模板（applyTemplate）：根据模板快照创建新的 `md_app_definition/md_app_branch/md_app_item_definition/md_app_view_definition/...` 记录。
- 快照 schema 克隆：当模板快照中包含 `schema` 时，同时克隆 `schema/schema_table/schema_field/schema_index/schema_relation`。

## Plan of Work

先创建 `dto.ts` 定义输入输出契约，再迁移 `app-template.service.ts`，实现模板创建、查询、更新、删除和套用。套用流程中先解析配置，再生成 ID 映射并在事务内执行 schema 与定义态克隆。随后创建 `app-template.router.ts`，并在 `rpc/router.ts` 挂载模块。最后新增 server e2e，验证主流程与异常分支。

## Concrete Steps

在仓库根目录执行：

1. `pnpm eslint --fix server/src/modules/app-template/dto.ts server/src/modules/app-template/app-template.service.ts server/src/modules/app-template/app-template.router.ts server/src/modules/app-template/index.ts server/src/rpc/router.ts server/test/app-template.test.ts`
2. `pnpm --filter ./server exec tsc --noEmit`
3. 由于历史 `.bak` 报错阻塞，执行目标文件级检查：
   `pnpm --filter ./server exec tsc --noEmit --ignoreConfig --target ESNext --module ESNext --moduleResolution bundler --types node --strict --esModuleInterop --isolatedModules --skipLibCheck --resolveJsonModule src/modules/app-template/dto.ts src/modules/app-template/app-template.service.ts src/modules/app-template/app-template.router.ts src/modules/app-template/index.ts src/rpc/router.ts`
4. `pnpm --filter ./server test:e2e test/app-template.test.ts`

## Validation and Acceptance

验收结果：

1. `server/src/rpc/router.ts` 已挂载 `appTemplate` 命名空间。
2. 以下接口已迁移可调用：
   - `appTemplate.create`
   - `appTemplate.list`
   - `appTemplate.categories`
   - `appTemplate.detail`
   - `appTemplate.update`
   - `appTemplate.delete`
   - `appTemplate.applyTemplate`
3. `server/test/app-template.test.ts` 验证通过：
   - 从部署历史创建模板成功；
   - 分页与分类/关键词筛选可用；
   - 模板详情/更新/删除闭环；
   - 套用模板成功并写入 `md_app_definition` + 克隆 schema；
   - 配置非法 JSON 时返回 `BAD_REQUEST`；
   - 来源历史不存在时返回 `NOT_FOUND`。
4. 本次新增/改动文件通过 ESLint 与目标文件级 TypeScript 检查。

## Idempotence and Recovery

迁移步骤为增量新增文件与路由挂载，可重复执行。测试数据通过 `afterEach` 清理函数按 `appId/templateId/schemaId` 统一回收。apply 失败时由事务回滚，避免半成品定义。当前阶段不改 `schema.prisma`，无需执行数据库迁移。

## Artifacts and Notes

关键命令输出摘要：

    pnpm eslint --fix server/src/modules/app-template/dto.ts server/src/modules/app-template/app-template.service.ts server/src/modules/app-template/app-template.router.ts server/src/modules/app-template/index.ts server/src/rpc/router.ts server/test/app-template.test.ts
    => 通过

    pnpm --filter ./server exec tsc --noEmit
    => 失败（仅历史 .bak 模块报错）

    pnpm --filter ./server exec tsc --noEmit --ignoreConfig --target ESNext --module ESNext --moduleResolution bundler --types node --strict --esModuleInterop --isolatedModules --skipLibCheck --resolveJsonModule src/modules/app-template/dto.ts src/modules/app-template/app-template.service.ts src/modules/app-template/app-template.router.ts src/modules/app-template/index.ts src/rpc/router.ts
    => 通过（本次迁移文件类型检查通过）

    pnpm --filter ./server test:e2e test/app-template.test.ts
    => 1 file passed, 3 tests passed

## Interfaces and Dependencies

本阶段新增 tRPC 接口位于 `appTemplate` 命名空间：

- `appTemplate.create`：从发布历史创建模板。
- `appTemplate.list`：分页查询模板。
- `appTemplate.categories`：查询模板分类。
- `appTemplate.detail`：查询模板详情。
- `appTemplate.update`：更新模板元信息。
- `appTemplate.delete`：删除模板。
- `appTemplate.applyTemplate`：按模板快照创建新应用定义。

依赖组件：

- `server/src/lib/prisma.ts`（数据库读写与事务）
- `server/src/rpc/trpc.ts`（`authedProcedure` 与 `router`）
- `zod`（输入输出契约）
- `node:crypto` 的 `randomUUID`（字符串主键生成）
- `server/src/lib/snowflake.ts`（BigInt 主键生成）

---

Revision Note (2026-04-23): 初版 Phase 5 ExecPlan，包含迁移步骤、验收标准和风险点。
Revision Note (2026-04-23): 完成第 5 阶段代码迁移与验证，补充 tRPC 保留词约束、测试证据和最终接口清单。
