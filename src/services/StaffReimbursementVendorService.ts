import type { Vendor } from '@prisma/client';
import { prisma } from '../utils/database';

export class StaffReimbursementVendorService {
  /**
   * Idempotent: returns existing linked vendor or creates a shell vendor and links it.
   * Use cashbook payment with counterpartyType SUPPLIER and this vendorId for staff reimbursement.
   */
  static async ensureReimbursementVendor(employeeId: string): Promise<{
    employeeId: string;
    vendor: Vendor;
    createdNewVendor: boolean;
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true, reimbursementVendor: true }
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    if (employee.reimbursementVendorId && employee.reimbursementVendor) {
      let v = employee.reimbursementVendor;
      if (!v.isActive) {
        v = await prisma.vendor.update({
          where: { id: v.id },
          data: { isActive: true }
        });
      }
      return { employeeId, vendor: v, createdNewVendor: false };
    }

    if (employee.reimbursementVendorId && !employee.reimbursementVendor) {
      await prisma.employee.update({
        where: { id: employeeId },
        data: { reimbursementVendorId: null }
      });
    }

    const { user } = employee;
    const vendorName = `Staff Reimbursement — ${user.lastName}, ${user.firstName} (${employee.employeeNumber})`;
    const vendor = await prisma.vendor.create({
      data: {
        name: vendorName,
        contactPerson: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: null,
        isActive: true
      }
    });

    await prisma.employee.update({
      where: { id: employeeId },
      data: { reimbursementVendorId: vendor.id }
    });

    return { employeeId, vendor, createdNewVendor: true };
  }

  static async getReimbursementVendor(employeeId: string): Promise<{
    employeeId: string;
    vendorId: string | null;
    vendor: Vendor | null;
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { reimbursementVendor: true }
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    return {
      employeeId,
      vendorId: employee.reimbursementVendorId,
      vendor: employee.reimbursementVendor
    };
  }
}
