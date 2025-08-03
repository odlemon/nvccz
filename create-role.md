# Creating Dynamic Roles

## Overview

The system now uses dynamic roles instead of enums. You can create any role with custom permissions.

## Role Structure

Each role has:
- **name**: Unique role name (e.g., "admin", "user", "moderator")
- **description**: Optional description of the role
- **permissions**: JSON array of permission objects

## Permission Format

```json
[
  { "name": "permission_name", "value": true },
  { "name": "another_permission", "value": false }
]
```

## Example: Creating a New Role

### Using Prisma Studio
1. Run `npm run prisma:studio`
2. Navigate to the `roles` table
3. Add a new record with:
   - name: "user"
   - description: "Regular user with limited access"
   - permissions: `[{"name": "view_dashboard", "value": true}]`

### Using Prisma Client (in code)

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create a new role
const userRole = await prisma.role.create({
  data: {
    name: 'user',
    description: 'Regular user with limited access',
    permissions: [
      { name: "view_dashboard", value: true },
      { name: "view_reports", value: false },
      { name: "manage_users", value: false }
    ]
  }
});

// Create a user with this role
const user = await prisma.user.create({
  data: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    password: hashedPassword,
    roleId: userRole.id
  }
});
```

## Common Permission Names

- `view_dashboard`
- `view_reports`
- `manage_users`
- `manage_roles`
- `view_billing`
- `manage_billing`
- `create_worklog`
- `edit_worklog`
- `delete_worklog`
- `view_payments`
- `manage_payments`
- `view_invoices`
- `create_invoice`
- `edit_invoice`
- `delete_invoice`

## Default Admin Role

The seed script creates an admin role with all permissions set to `true`. 