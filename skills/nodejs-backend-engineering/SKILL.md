---
name: nodejs-backend-engineering
description: Production Node.js & TypeScript backend engineering covering Express.js, Fastify, and NestJS. Event loop management, async error handling, DTO validation, middleware pipelines, security headers (Helmet), connection pooling, and graceful shutdowns. Use when building or refactoring Node.js and TypeScript backends.
metadata:
  origin: ASEF
---

# Node.js & TypeScript Backend Engineering

Production-grade engineering standards for Node.js backends using Express.js, Fastify, and NestJS.

## When to Activate

- Designing or implementing Node.js/TypeScript APIs
- Choosing between Express.js, Fastify, or NestJS
- Handling async errors and preventing uncaught process crashes
- Implementing request validation (Zod, TypeBox, class-validator)
- Configuring security middleware, CORS, and HTTP headers
- Implementing graceful shutdown hooks for containerized workloads

---

## 1. Node.js Runtime Fundamentals

### Event Loop & Thread Pool
- Never run CPU-bound computations (image processing, heavy crypto, large array sorting) directly on the main event loop.
- Use `worker_threads` for CPU-intensive tasks.
- For disk I/O and DNS lookups, tune the libuv threadpool size if needed:
  ```bash
  UV_THREADPOOL_SIZE=16 node dist/index.js
  ```

### Uncaught Error and Signal Traps
Every production Node.js service must capture termination signals and unhandled rejections cleanly:

```typescript
import { createServer } from 'http';

const server = createServer(app);

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.info(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    try {
      await db.$disconnect(); // Prisma or pool.end()
      await redis.quit();
      console.info('All database connections closed.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
  // In production, log with alert, and fail fast if state is corrupted
});
```

---

## 2. Express.js Production Patterns

### Async Handler & Centralized Error Middleware

In Express 4.x, unhandled async promise rejections do not propagate to the error middleware without wrapping. In Express 5.x or using an async wrapper:

```typescript
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';

const app = express();

// Security baseline
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || false, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Async error wrapper
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Schema validation middleware
export const validate = (schema: z.ZodSchema) =>
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    req.body = await schema.parseAsync(req.body);
    next();
  });

// Route
const CreateUserDto = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100)
});

app.post('/api/v1/users', validate(CreateUserDto), asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(201).json({ data: user });
}));

// Centralized error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      type: 'https://tools.ietf.org/html/rfc7807',
      title: 'Validation Error',
      status: 400,
      errors: err.errors
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    type: 'https://tools.ietf.org/html/rfc7807',
    title: statusCode === 500 ? 'Internal Server Error' : err.message,
    status: statusCode,
    instance: req.originalUrl
  });
});
```

---

## 3. Fastify High-Performance Patterns

Fastify compiles route schemas to optimized JSON serializers (`fast-json-stringify`), delivering 2x to 5x higher throughput than Express.

```typescript
import Fastify from 'fastify';
import { Type, Static } from '@sinclair/typebox';

const fastify = Fastify({ logger: true });

const UserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  displayName: Type.String()
});

const CreateUserBody = Type.Object({
  email: Type.String({ format: 'email' }),
  displayName: Type.String({ minLength: 2 })
});

fastify.post<{ Body: Static<typeof CreateUserBody> }>(
  '/api/v1/users',
  {
    schema: {
      body: CreateUserBody,
      response: {
        201: UserSchema
      }
    }
  },
  async (request, reply) => {
    const user = await userService.create(request.body);
    reply.code(201).send(user);
  }
);
```

---

## 4. NestJS Enterprise Patterns

Use NestJS when building large-scale, modular enterprise applications that require structured dependency injection and uniform conventions.

### Feature Module Separation

```text
src/
├── app.module.ts
├── common/
│   ├── guards/          # AuthGuard, RolesGuard
│   ├── filters/         # HttpExceptionFilter
│   └── interceptors/   # LoggingInterceptor, TransformInterceptor
└── modules/
    └── orders/
        ├── orders.module.ts
        ├── orders.controller.ts
        ├── orders.service.ts
        ├── orders.repository.ts
        └── dto/
            ├── create-order.dto.ts
            └── order-response.dto.ts
```

### DTO Validation with Class-Validator

```typescript
import { IsString, IsNotEmpty, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNotEmpty()
  quantity: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
```

### Global Pipes and Exception Filter in Bootstrap

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Strip unhandled properties
      forbidNonWhitelisted: true,  // Reject payloads with unhandled properties
      transform: true              // Auto-cast types
    })
  );

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
```
