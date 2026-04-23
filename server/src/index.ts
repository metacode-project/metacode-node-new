import { buildApp } from './app'

const app = buildApp()

app
  .listen({
    host: '0.0.0.0',
    port: 2023,
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
