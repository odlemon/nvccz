# 🎭 Role Definition Workflow

**A User Story Guide for Setting Up Dynamic Roles**

---

## 📋 **Step 1: Creating Departments**

### **As an Administrator, I want to create departments so that I can organize my company structure.**

**How to create a department:**

1. **Provide department details**
   - **Name**: The official name (e.g., "Finance", "Marketing")
   - **Description**: What this department is responsible for
   - **Code** (optional): Short identifier (e.g., "FIN", "MKT")

2. **Set department status**
   - **Active**: Currently in use
   - **Inactive**: Exists but not currently active

**Result:** Department is created and available for role creation.

---

## 👔 **Step 2: Creating Roles for Each Department**

### **As an Administrator, I want to create roles within departments so that I can define different levels of responsibility.**

**How to create a role:**

1. **Select the department**
   - Choose which department this role belongs to

2. **Define the role details**
   - **Role Name**: Position title (e.g., "Finance Manager", "Marketing Coordinator")
   - **Role Code**: Unique identifier (e.g., "FIN_MGR", "MKT_COORD")
   - **Description**: What this role is responsible for
   - **Level**: Hierarchy level (5 = Manager, 4 = Officer, 3 = Specialist, 2 = Assistant, 1 = Member)

3. **Set role status**
   - **Active**: Currently in use
   - **Inactive**: Not currently assigned

**Result:** Role is created and ready for permission configuration.

---

## 🔐 **Step 3: Defining What Each Role Can Do (Permissions)**

### **As an Administrator, I want to define permissions for each role so that users only have access to what they need.**

**How to define permissions:**

1. **Select the role**
   - Choose which role you're configuring

2. **Assign permissions by module** (Events, Procurement, Finance, etc.)
   - **View**: Can see information
   - **Create**: Can add new records
   - **Edit**: Can modify records
   - **Delete**: Can remove records
   - **Approve**: Can approve requests/budgets
   - **Export**: Can download reports
   - **Admin**: Full module access

3. **Set permission scope**
   - **Own Only**: Access only their own records
   - **Department**: Access department records
   - **All**: Access all records

**Common Permission Patterns:**

- **Manager (Level 5)**: Full department access, approve, export, manage users
- **Officer/Specialist (Level 4)**: View department, create/edit own, export limited
- **Coordinator (Level 3)**: View department, create, edit own only
- **Assistant (Level 2)**: View limited, create basic
- **Member (Level 1)**: View only

**Result:** Role permissions are configured and ready for user assignment.

---

## 👥 **Step 4: Assigning Users to Roles**

### **As an Administrator, I want to assign users to roles so that they have appropriate access for their job.**

**How to assign a user to a role:**

1. **Select the user**
   - Find user by name, email, or employee ID

2. **Choose the department**
   - Select user's department

3. **Assign the role**
   - Select appropriate role from department's available roles

4. **Set assignment details**
   - **Start Date**: When role becomes active
   - **End Date** (optional): For temporary assignments
   - **Primary Role**: Mark if this is their main role

5. **Review permissions summary**
   - Verify permissions match job requirements

**Result:** User immediately receives role permissions and can access system features accordingly.

---

## 🔄 **Complete Example: Setting Up Marketing Department**

**Step 1:** Create "Marketing" department with description and set to Active

**Step 2:** Create roles:
- "Marketing Manager" (Level 5)
- "Marketing Specialist" (Level 4)
- "Content Coordinator" (Level 3)
- "Marketing Assistant" (Level 2)

**Step 3:** Define permissions:
- Manager: Full access to Events, Marketing, Reports
- Specialist: Create/edit Events (no budget approval), create campaigns
- Coordinator: View/create Events, create content
- Assistant: View only Events, create basic records

**Step 4:** Assign users to their respective roles

**Result:** Marketing department is fully set up with appropriate access levels.

---

## 🎯 **Summary**

The workflow consists of four steps:

1. **Create Departments** - Organize company structure
2. **Create Roles** - Define positions within departments
3. **Define Permissions** - Specify what each role can do
4. **Assign Users** - Give people the access they need

