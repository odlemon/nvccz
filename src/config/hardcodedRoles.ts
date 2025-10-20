// @ts-nocheck
/**
 * Hardcoded Roles Repository
 * 
 * This file contains all hardcoded roles grouped by department.
 * These roles are used for user assignment and system organization.
 * Approval permissions are configured separately in procurement configurations.
 */

export interface HardcodedRole {
  code: string;
  name: string;
  level: number; // 5 = Manager, 4 = Officer, 3 = Specialist, 2 = Assistant, 1 = Member
  department: string;
  description: string;
}

export interface DepartmentWithRoles {
  department: string;
  departmentCode: string;
  description: string;
  roles: HardcodedRole[];
}

// Hardcoded Departments
export const DEPARTMENTS = [
  "Finance",
  "Operations",
  "Procurement",
  "Human Resources",
  "Marketing",
  "Legal",
  "IT"
] as const;

// All Hardcoded Roles
export const HARDCODED_ROLES: HardcodedRole[] = [
  // ===== FINANCE DEPARTMENT =====
  {
    code: "FIN_MGR",
    name: "Finance Manager",
    level: 5,
    department: "Finance",
    description: "Head of finance department, oversees all financial operations"
  },
  {
    code: "FIN_OFF",
    name: "Finance Officer",
    level: 4,
    department: "Finance",
    description: "Senior finance role, handles transactions and processes payments"
  },
  {
    code: "ACCOUNTANT",
    name: "Accountant",
    level: 3,
    department: "Finance",
    description: "Manages accounting entries, reconciliations, and financial records"
  },
  {
    code: "FIN_ASST",
    name: "Finance Assistant",
    level: 2,
    department: "Finance",
    description: "Supports finance operations and assists senior staff"
  },
  {
    code: "FIN_MEM",
    name: "Finance Member",
    level: 1,
    department: "Finance",
    description: "Basic finance access, view and create only"
  },

  // ===== OPERATIONS DEPARTMENT =====
  {
    code: "OPS_MGR",
    name: "Operations Manager",
    level: 5,
    department: "Operations",
    description: "Head of operations department, oversees all operational activities"
  },
  {
    code: "OPS_OFF",
    name: "Operations Officer",
    level: 4,
    department: "Operations",
    description: "Manages daily operations and coordinates activities"
  },
  {
    code: "OPS_COORD",
    name: "Operations Coordinator",
    level: 3,
    department: "Operations",
    description: "Coordinates operational tasks and processes"
  },
  {
    code: "OPS_ANALYST",
    name: "Operations Analyst",
    level: 2,
    department: "Operations",
    description: "Analyzes operational data and provides insights"
  },
  {
    code: "OPS_MEM",
    name: "Operations Member",
    level: 1,
    department: "Operations",
    description: "Basic operational tasks and support"
  },

  // ===== PROCUREMENT DEPARTMENT =====
  {
    code: "PROC_MGR",
    name: "Procurement Manager",
    level: 5,
    department: "Procurement",
    description: "Head of procurement, oversees all purchasing activities"
  },
  {
    code: "PROC_OFF",
    name: "Procurement Officer",
    level: 4,
    department: "Procurement",
    description: "Handles procurement processes and vendor management"
  },
  {
    code: "BUYER",
    name: "Buyer",
    level: 3,
    department: "Procurement",
    description: "Creates requisitions, manages vendors, and negotiates purchases"
  },
  {
    code: "PROC_COORD",
    name: "Procurement Coordinator",
    level: 2,
    department: "Procurement",
    description: "Coordinates procurement activities and documentation"
  },
  {
    code: "PROC_MEM",
    name: "Procurement Member",
    level: 1,
    department: "Procurement",
    description: "Basic procurement tasks and support"
  },

  // ===== HUMAN RESOURCES DEPARTMENT =====
  {
    code: "HR_MGR",
    name: "HR Manager",
    level: 5,
    department: "Human Resources",
    description: "Head of HR department, oversees all HR operations"
  },
  {
    code: "HR_OFF",
    name: "HR Officer",
    level: 4,
    department: "Human Resources",
    description: "Manages HR processes, employee relations, and policies"
  },
  {
    code: "RECRUITER",
    name: "Recruiter",
    level: 3,
    department: "Human Resources",
    description: "Handles recruitment, hiring, and onboarding processes"
  },
  {
    code: "HR_COORD",
    name: "HR Coordinator",
    level: 2,
    department: "Human Resources",
    description: "Coordinates HR activities and employee services"
  },
  {
    code: "HR_MEM",
    name: "HR Member",
    level: 1,
    department: "Human Resources",
    description: "Basic HR tasks and administrative support"
  },

  // ===== MARKETING DEPARTMENT =====
  {
    code: "MKT_MGR",
    name: "Marketing Manager",
    level: 5,
    department: "Marketing",
    description: "Head of marketing, oversees all marketing initiatives"
  },
  {
    code: "MKT_OFF",
    name: "Marketing Officer",
    level: 4,
    department: "Marketing",
    description: "Manages marketing campaigns and strategies"
  },
  {
    code: "CONTENT_CREATOR",
    name: "Content Creator",
    level: 3,
    department: "Marketing",
    description: "Creates marketing content and brand materials"
  },
  {
    code: "SOCIAL_MEDIA_MGR",
    name: "Social Media Manager",
    level: 2,
    department: "Marketing",
    description: "Manages social media platforms and online presence"
  },
  {
    code: "MKT_MEM",
    name: "Marketing Member",
    level: 1,
    department: "Marketing",
    description: "Basic marketing tasks and support"
  },

  // ===== LEGAL DEPARTMENT =====
  {
    code: "LEGAL_MGR",
    name: "Legal Manager",
    level: 5,
    department: "Legal",
    description: "Head of legal department, oversees all legal matters"
  },
  {
    code: "LEGAL_OFF",
    name: "Legal Officer",
    level: 4,
    department: "Legal",
    description: "Handles legal processes and documentation"
  },
  {
    code: "COMPLIANCE_OFF",
    name: "Compliance Officer",
    level: 3,
    department: "Legal",
    description: "Ensures regulatory compliance and risk management"
  },
  {
    code: "LEGAL_ADVISOR",
    name: "Legal Advisor",
    level: 2,
    department: "Legal",
    description: "Provides legal advice and guidance"
  },
  {
    code: "LEGAL_MEM",
    name: "Legal Member",
    level: 1,
    department: "Legal",
    description: "Basic legal support and documentation"
  },

  // ===== IT DEPARTMENT =====
  {
    code: "IT_MGR",
    name: "IT Manager",
    level: 5,
    department: "IT",
    description: "Head of IT department, oversees all technology operations"
  },
  {
    code: "SYSADMIN",
    name: "System Administrator",
    level: 4,
    department: "IT",
    description: "Manages systems, infrastructure, and network"
  },
  {
    code: "DEVELOPER",
    name: "Developer",
    level: 3,
    department: "IT",
    description: "Develops and maintains applications and systems"
  },
  {
    code: "IT_SUPPORT",
    name: "IT Support Specialist",
    level: 2,
    department: "IT",
    description: "Provides technical support to users"
  },
  {
    code: "IT_MEM",
    name: "IT Member",
    level: 1,
    department: "IT",
    description: "Basic IT tasks and support"
  }
];

/**
 * Get all hardcoded roles
 */
export function getAllRoles(): HardcodedRole[] {
  return HARDCODED_ROLES;
}

/**
 * Get roles by department
 */
export function getRolesByDepartment(department: string): HardcodedRole[] {
  return HARDCODED_ROLES.filter(role => role.department === department);
}

/**
 * Get role by code
 */
export function getRoleByCode(code: string): HardcodedRole | undefined {
  return HARDCODED_ROLES.find(role => role.code === code);
}

/**
 * Get all departments with their roles
 */
export function getAllDepartmentsWithRoles(): DepartmentWithRoles[] {
  return DEPARTMENTS.map(dept => ({
    department: dept,
    departmentCode: dept.toUpperCase().replace(/\s+/g, '_'),
    description: `${dept} Department`,
    roles: getRolesByDepartment(dept)
  }));
}

/**
 * Get department with roles
 */
export function getDepartmentWithRoles(department: string): DepartmentWithRoles | null {
  if (!DEPARTMENTS.includes(department as any)) {
    return null;
  }

  return {
    department: department,
    departmentCode: department.toUpperCase().replace(/\s+/g, '_'),
    description: `${department} Department`,
    roles: getRolesByDepartment(department)
  };
}

/**
 * Validate if role code exists
 */
export function isValidRoleCode(code: string): boolean {
  return HARDCODED_ROLES.some(role => role.code === code);
}

/**
 * Validate if role belongs to department
 */
export function rolebelongsToDepartment(roleCode: string, department: string): boolean {
  const role = getRoleByCode(roleCode);
  return role?.department === department;
}






