// @ts-nocheck
import { PrismaClient, Decimal } from '@prisma/client';
import { prisma } from '../utils/database';
import { remoteUploadService } from './RemoteUploadService';

export interface CSVTransaction {
  bankName: string;
  bankId?: string; // Resolved during validation
  transactionDate: string;
  description: string;
  amount: number;
  reference: string;
  counterpartyType: 'CUSTOMER' | 'SUPPLIER' | 'GL';
  customerName?: string;
  customerId?: string; // Resolved during validation
  vendorName?: string;
  vendorId?: string; // Resolved during validation
  glAccountNo?: string;
  glAccountId?: string; // Resolved during validation
  vatCode?: string;
  projectCode?: string;
  discount?: number;
}

export interface BatchImportResult {
  batchId: string;
  totalTransactions: number;
  validTransactions: number;
  invalidTransactions: number;
  errors: string[];
  fileUrl: string;
}

export class CashbookBatchImportService {
  
  /**
   * Import CSV file and create batch
   * POST /api/cashbook/batches/import
   */
  static async importCSV(file: Buffer, fileName: string, userId: string): Promise<BatchImportResult> {
    try {
      console.log(`📁 Processing CSV import: ${fileName}`);
      
      // 1. Upload file to remote server (optional - continue even if it fails)
      let fileUrl: string | null = null;
      try {
        const uploadResult = await remoteUploadService.uploadSingleFile(
          {
            buffer: file,
            originalname: fileName,
            mimetype: 'text/csv',
          },
          'cashbook-imports'
        );
        
        fileUrl = uploadResult.downloadURL;
        console.log(`✅ File uploaded to remote server: ${fileUrl}`);
      } catch (uploadError: any) {
        // Extract detailed error message from axios errors
        let errorMsg = uploadError.message || 'Unknown upload error';
        if (uploadError.response) {
          errorMsg = `Upload service error: ${uploadError.response.status} - ${uploadError.response.statusText}`;
          if (uploadError.response.data?.message) {
            errorMsg += ` - ${uploadError.response.data.message}`;
          }
        } else if (uploadError.code) {
          errorMsg = `Upload network error: ${uploadError.code} - ${errorMsg}`;
        }
        console.warn(`⚠️ File upload failed (continuing with import): ${errorMsg}`);
        // Continue processing even if upload fails
      }
      
      // 2. Parse CSV content
      const csvContent = file.toString('utf-8');
      if (!csvContent || csvContent.trim().length === 0) {
        throw new Error('CSV file is empty');
      }
      
      const transactions = this.parseCSV(csvContent);
      
      if (transactions.length === 0) {
        throw new Error('No transactions found in CSV file. Please check the file format.');
      }
      
      console.log(`📊 Parsed ${transactions.length} transactions from CSV`);
      
      // 3. Validate transactions
      const validationResult = await this.validateTransactions(transactions);
      
      if (validationResult.validTransactions.length === 0) {
        throw new Error(`No valid transactions found. Errors: ${validationResult.errors.join('; ')}`);
      }
      
      // 4. Create batch
      const batch = await prisma.cashbookBatch.create({
        data: {
          name: `CSV Import - ${new Date().toISOString().split('T')[0]}`,
          description: `Imported from ${fileName}`,
          status: 'PENDING',
          totalAmount: new Decimal(0), // Will be calculated
          createdById: userId,
          importFileUrl: fileUrl
        }
      });
      
      // 5. Create cashbook entries for valid transactions
      let validCount = 0;
      for (const transaction of validationResult.validTransactions) {
        try {
          // Ensure bankId is resolved
          if (!transaction.bankId) {
            console.error(`❌ Transaction missing bankId: ${JSON.stringify(transaction)}`);
            continue;
          }
          
          await prisma.cashbookEntry.create({
            data: {
              bankId: transaction.bankId,
              transactionDate: new Date(transaction.transactionDate),
              type: transaction.counterpartyType === 'CUSTOMER' ? 'RECEIPT' : 'PAYMENT',
              amount: new Decimal(transaction.amount),
              reference: transaction.reference,
              description: transaction.description,
              status: 'PENDING',
              counterpartyType: transaction.counterpartyType,
              glAccountId: transaction.glAccountId,
              customerId: transaction.customerId,
              vendorId: transaction.vendorId,
              batchId: batch.id,
              createdById: userId
            }
          });
          validCount++;
        } catch (error) {
          console.error(`❌ Error creating transaction: ${error.message}`);
        }
      }
      
      // 6. Update batch with final counts
      await prisma.cashbookBatch.update({
        where: { id: batch.id },
        data: {
          totalAmount: new Decimal(
            validationResult.validTransactions.reduce((sum, t) => sum + t.amount, 0)
          )
        }
      });
      
      console.log(`✅ Batch created: ${batch.id} with ${validCount} valid transactions`);
      
      return {
        batchId: batch.id,
        totalTransactions: transactions.length,
        validTransactions: validCount,
        invalidTransactions: validationResult.errors.length,
        errors: validationResult.errors,
        fileUrl: fileUrl || ''
      };
      
    } catch (error: any) {
      console.error('❌ Error importing CSV:', error);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Stack trace:', error.stack);
      
      // Extract detailed error message
      let errorMessage = error.message || 'Unknown error occurred during CSV import';
      
      // Handle Prisma errors
      if (error.code) {
        if (error.code === 'P2002') {
          errorMessage = `Duplicate entry: ${error.meta?.target?.join(', ') || 'unique constraint violation'}`;
        } else if (error.code === 'P2025') {
          errorMessage = `Record not found: ${error.meta?.cause || 'resource does not exist'}`;
        } else if (error.code === 'P2003') {
          errorMessage = `Foreign key constraint failed: ${error.meta?.field_name || 'invalid reference'}`;
        } else {
          errorMessage = `Database error (${error.code}): ${errorMessage}`;
        }
      }
      
      // Handle axios/network errors
      if (error.response) {
        errorMessage = `Remote service error: ${error.response.status} - ${error.response.statusText}`;
        if (error.response.data?.message) {
          errorMessage += ` - ${error.response.data.message}`;
        }
      } else if (error.code && (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND')) {
        errorMessage = `Network error (${error.code}): ${errorMessage}`;
      }
      
      throw new Error(errorMessage);
    }
  }
  
  /**
   * Parse CSV content into transaction objects
   */
  private static parseCSV(csvContent: string): CSVTransaction[] {
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('CSV file is empty or has no content');
    }
    
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    if (headers.length === 0) {
      throw new Error('CSV file has no headers');
    }
    
    // Validate required headers
    const hasBankName = headers.some(h => h === 'bankname' || h === 'bank');
    const hasDate = headers.some(h => h === 'transactiondate' || h === 'date');
    const hasAmount = headers.some(h => h === 'amount');
    
    if (!hasBankName) {
      throw new Error('CSV file must have a "bankName" or "bank" column');
    }
    if (!hasDate) {
      throw new Error('CSV file must have a "transactionDate" or "date" column');
    }
    if (!hasAmount) {
      throw new Error('CSV file must have an "amount" column');
    }
    
    const transactions: CSVTransaction[] = [];
    
    // Find column indices
    const getColumnIndex = (name: string): number => {
      const index = headers.findIndex(h => h === name.toLowerCase());
      return index >= 0 ? index : -1;
    };
    
    const bankNameIdx = getColumnIndex('bankName') >= 0 ? getColumnIndex('bankName') : getColumnIndex('bank');
    const dateIdx = getColumnIndex('transactionDate') >= 0 ? getColumnIndex('transactionDate') : getColumnIndex('date');
    const descIdx = getColumnIndex('description');
    const amountIdx = getColumnIndex('amount');
    const refIdx = getColumnIndex('reference');
    const counterpartyIdx = getColumnIndex('counterpartyType') >= 0 ? getColumnIndex('counterpartyType') : getColumnIndex('type');
    const customerIdx = getColumnIndex('customerName') >= 0 ? getColumnIndex('customerName') : (getColumnIndex('customerId') >= 0 ? getColumnIndex('customerId') : getColumnIndex('customer'));
    const vendorIdx = getColumnIndex('vendorName') >= 0 ? getColumnIndex('vendorName') : (getColumnIndex('vendorId') >= 0 ? getColumnIndex('vendorId') : (getColumnIndex('vendor') >= 0 ? getColumnIndex('vendor') : getColumnIndex('supplier')));
    const glAccountIdx = getColumnIndex('glAccountNo') >= 0 ? getColumnIndex('glAccountNo') : (getColumnIndex('glAccountId') >= 0 ? getColumnIndex('glAccountId') : (getColumnIndex('contraAccount') >= 0 ? getColumnIndex('contraAccount') : getColumnIndex('glaccount')));
    const vatIdx = getColumnIndex('vatCode') >= 0 ? getColumnIndex('vatCode') : getColumnIndex('vat');
    const projectIdx = getColumnIndex('projectCode') >= 0 ? getColumnIndex('projectCode') : getColumnIndex('project');
    const discountIdx = getColumnIndex('discount');
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      
      if (values.length !== headers.length) {
        // Try to handle quoted values that might contain commas
        continue;
      }
      
      const transaction: CSVTransaction = {
        bankName: bankNameIdx >= 0 ? values[bankNameIdx] || '' : '',
        transactionDate: dateIdx >= 0 ? values[dateIdx] || '' : '',
        description: descIdx >= 0 ? values[descIdx] || '' : '',
        amount: amountIdx >= 0 ? parseFloat(values[amountIdx]) || 0 : 0,
        reference: refIdx >= 0 ? values[refIdx] || '' : '',
        counterpartyType: counterpartyIdx >= 0 ? (values[counterpartyIdx] as any)?.toUpperCase() || 'GL' : 'GL',
        customerName: customerIdx >= 0 ? values[customerIdx] || undefined : undefined,
        vendorName: vendorIdx >= 0 ? values[vendorIdx] || undefined : undefined,
        glAccountNo: glAccountIdx >= 0 ? values[glAccountIdx] || undefined : undefined,
        vatCode: vatIdx >= 0 ? values[vatIdx] || '15%' : '15%',
        projectCode: projectIdx >= 0 ? values[projectIdx] || undefined : undefined,
        discount: discountIdx >= 0 ? parseFloat(values[discountIdx]) || 0 : 0
      };
      
      transactions.push(transaction);
    }
    
    return transactions;
  }
  
  /**
   * Validate all transactions
   */
  private static async validateTransactions(transactions: CSVTransaction[]): Promise<{
    validTransactions: CSVTransaction[];
    errors: string[];
  }> {
    const validTransactions: CSVTransaction[] = [];
    const errors: string[] = [];
    
    // Get all active banks for validation
    const allBanks = await prisma.bank.findMany({
      where: { isActive: true },
      select: { id: true, name: true, accountNumber: true }
    });
    
    // Get all active customers for validation
    const allCustomers = await prisma.customer.findMany({
      where: { isActive: true },
      select: { id: true, name: true }
    });
    
    // Get all active vendors for validation
    const allVendors = await prisma.vendor.findMany({
      where: { isActive: true },
      select: { id: true, name: true }
    });
    
    // Get all active GL accounts for validation
    const allGLAccounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      select: { id: true, accountNo: true, accountName: true }
    });
    
    // Create maps for quick lookup (case-insensitive)
    const bankMap = new Map<string, typeof allBanks[0]>();
    for (const bank of allBanks) {
      bankMap.set(bank.name.toLowerCase(), bank);
      // Also allow lookup by account number
      if (bank.accountNumber) {
        bankMap.set(bank.accountNumber.toLowerCase(), bank);
      }
    }
    
    const customerMap = new Map<string, typeof allCustomers[0]>();
    for (const customer of allCustomers) {
      customerMap.set(customer.name.toLowerCase(), customer);
    }
    
    const vendorMap = new Map<string, typeof allVendors[0]>();
    for (const vendor of allVendors) {
      vendorMap.set(vendor.name.toLowerCase(), vendor);
    }
    
    const glAccountMap = new Map<string, typeof allGLAccounts[0]>();
    for (const account of allGLAccounts) {
      glAccountMap.set(account.accountNo.toLowerCase(), account);
      // Also allow lookup by account name (case-insensitive)
      glAccountMap.set(account.accountName.toLowerCase(), account);
    }
    
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      const rowNumber = i + 2; // +2 because CSV is 1-indexed and we skip header
      
      try {
        // Validate required fields
        if (!transaction.bankName || transaction.bankName.trim() === '') {
          errors.push(`Row ${rowNumber}: Bank name is required`);
          continue;
        }
        
        // Resolve bank by name
        const bankKey = transaction.bankName.trim().toLowerCase();
        const bank = bankMap.get(bankKey);
        
        if (!bank) {
          // Try to find by partial match
          const matchedBank = allBanks.find(b => 
            b.name.toLowerCase().includes(bankKey) || 
            bankKey.includes(b.name.toLowerCase())
          );
          
          if (matchedBank) {
            transaction.bankId = matchedBank.id;
          } else {
            errors.push(`Row ${rowNumber}: Bank account "${transaction.bankName}" not found. Available banks: ${allBanks.map(b => b.name).join(', ')}`);
            continue;
          }
        } else {
          transaction.bankId = bank.id;
        }
        
        if (!transaction.transactionDate) {
          errors.push(`Row ${rowNumber}: Transaction date is required`);
          continue;
        }
        
        // Validate date format
        const transactionDate = new Date(transaction.transactionDate);
        if (isNaN(transactionDate.getTime())) {
          errors.push(`Row ${rowNumber}: Invalid date format. Use YYYY-MM-DD`);
          continue;
        }
        
        // Check if date is in the future
        if (transactionDate > new Date()) {
          errors.push(`Row ${rowNumber}: Transaction date cannot be in the future`);
          continue;
        }
        
        if (!transaction.description || transaction.description.trim() === '') {
          errors.push(`Row ${rowNumber}: Description is required`);
          continue;
        }
        
        if (!transaction.amount || transaction.amount <= 0) {
          errors.push(`Row ${rowNumber}: Valid amount (greater than 0) is required`);
          continue;
        }
        
        // Validate amount is a valid number
        if (isNaN(transaction.amount)) {
          errors.push(`Row ${rowNumber}: Amount must be a valid number`);
          continue;
        }
        
        // Validate and resolve counterparty
        if (transaction.counterpartyType === 'CUSTOMER') {
          if (!transaction.customerName || transaction.customerName.trim() === '') {
            errors.push(`Row ${rowNumber}: Customer name is required for CUSTOMER transactions`);
          continue;
        }
        
          const customerKey = transaction.customerName.trim().toLowerCase();
          const customer = customerMap.get(customerKey);
          
          if (!customer) {
            // Try partial match
            const matchedCustomer = allCustomers.find(c => 
              c.name.toLowerCase().includes(customerKey) || 
              customerKey.includes(c.name.toLowerCase())
            );
            
            if (matchedCustomer) {
              transaction.customerId = matchedCustomer.id;
            } else {
              errors.push(`Row ${rowNumber}: Customer "${transaction.customerName}" not found. Available customers: ${allCustomers.map(c => c.name).join(', ')}`);
            continue;
          }
          } else {
            transaction.customerId = customer.id;
          }
        }
        
        if (transaction.counterpartyType === 'SUPPLIER') {
          if (!transaction.vendorName || transaction.vendorName.trim() === '') {
            errors.push(`Row ${rowNumber}: Vendor name is required for SUPPLIER transactions`);
            continue;
          }
          
          const vendorKey = transaction.vendorName.trim().toLowerCase();
          const vendor = vendorMap.get(vendorKey);
          
          if (!vendor) {
            // Try partial match
            const matchedVendor = allVendors.find(v => 
              v.name.toLowerCase().includes(vendorKey) || 
              vendorKey.includes(v.name.toLowerCase())
            );
            
            if (matchedVendor) {
              transaction.vendorId = matchedVendor.id;
            } else {
              errors.push(`Row ${rowNumber}: Vendor "${transaction.vendorName}" not found. Available vendors: ${allVendors.map(v => v.name).join(', ')}`);
            continue;
          }
          } else {
            transaction.vendorId = vendor.id;
          }
        }
        
        if (transaction.counterpartyType === 'GL') {
          if (!transaction.glAccountNo || transaction.glAccountNo.trim() === '') {
            errors.push(`Row ${rowNumber}: GL account number is required for GL transactions`);
            continue;
          }
          
          const glKey = transaction.glAccountNo.trim().toLowerCase();
          const glAccount = glAccountMap.get(glKey);
          
          if (!glAccount) {
            // Try to find by account number or name
            const matchedAccount = allGLAccounts.find(a => 
              a.accountNo.toLowerCase() === glKey ||
              a.accountName.toLowerCase().includes(glKey) ||
              glKey.includes(a.accountName.toLowerCase())
            );
            
            if (matchedAccount) {
              transaction.glAccountId = matchedAccount.id;
            } else {
              errors.push(`Row ${rowNumber}: GL account "${transaction.glAccountNo}" not found. Available accounts: ${allGLAccounts.slice(0, 10).map(a => `${a.accountNo} - ${a.accountName}`).join(', ')}${allGLAccounts.length > 10 ? '...' : ''}`);
            continue;
          }
          } else {
            transaction.glAccountId = glAccount.id;
          }
        }
        
        // Final validation: ensure required IDs were resolved
        if (!transaction.bankId) {
          errors.push(`Row ${rowNumber}: Failed to resolve bank account "${transaction.bankName}"`);
          continue;
        }
        
        if (transaction.counterpartyType === 'CUSTOMER' && !transaction.customerId) {
          errors.push(`Row ${rowNumber}: Failed to resolve customer "${transaction.customerName}"`);
          continue;
        }
        
        if (transaction.counterpartyType === 'SUPPLIER' && !transaction.vendorId) {
          errors.push(`Row ${rowNumber}: Failed to resolve vendor "${transaction.vendorName}"`);
          continue;
        }
        
        if (transaction.counterpartyType === 'GL' && !transaction.glAccountId) {
          errors.push(`Row ${rowNumber}: Failed to resolve GL account "${transaction.glAccountNo}"`);
          continue;
        }
        
        validTransactions.push(transaction);
        
      } catch (error: any) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }
    
    return { validTransactions, errors };
  }
  
  /**
   * Generate CSV template with actual data from database
   */
  static async generateTemplate(): Promise<string> {
    // Get all active banks
    const banks = await prisma.bank.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' }
    });
    
    // Get sample customers
    const customers = await prisma.customer.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' },
      take: 5
    });
    
    // Get sample vendors
    const vendors = await prisma.vendor.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' },
      take: 5
    });
    
    // Get sample GL accounts
    const glAccounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      select: { accountNo: true, accountName: true },
      orderBy: { accountNo: 'asc' },
      take: 10
    });
    
    const bankNames = banks.map(b => b.name).join(', ');
    const customerNames = customers.map(c => c.name).join(', ');
    const vendorNames = vendors.map(v => v.name).join(', ');
    const glAccountList = glAccounts.map(a => `${a.accountNo} - ${a.accountName}`).join(', ');
    
    // Use first available data for examples
    const exampleBank = banks[0]?.name || 'Main Bank';
    const exampleCustomer = customers[0]?.name || '';
    const exampleVendor = vendors[0]?.name || '';
    const exampleGLAccount = glAccounts[0]?.accountNo || '';
    
    const today = new Date().toISOString().split('T')[0];
    
    let template = `bankName,transactionDate,description,amount,reference,counterpartyType,customerName,vendorName,glAccountNo,vatCode,projectCode,discount
${exampleBank},${today},Customer Payment - Invoice #INV-001,1500.00,RCP-001,CUSTOMER,${exampleCustomer},,,15%,PROJ-001,0
${exampleBank},${today},GL Receipt - Share Capital,5000.00,RCP-002,GL,,,${exampleGLAccount},15%,,0
${exampleBank},${today},Supplier Payment - Office Supplies,250.00,PAY-001,SUPPLIER,,${exampleVendor},,15%,PROJ-002,0

Available Options:
- Banks: ${bankNames}
- Customers: ${customerNames}
- Vendors: ${vendorNames}
- GL Accounts: ${glAccountList}

Notes:
- Use exact names/account numbers as shown above (case-insensitive)
- counterpartyType must be: CUSTOMER, SUPPLIER, or GL
- vatCode must be: 15%, 0%, or EXEMPT
- Date format: YYYY-MM-DD
- Amount must be positive number
- Leave fields empty if not applicable`;
    
    return template;
  }
  
  /**
   * Post batch to GL (SRD-compliant batch posting)
   */
  static async postBatch(batchId: string, userId: string): Promise<any> {
    try {
      console.log(`📤 Posting batch: ${batchId}`);
      
      // 1. Get batch with all transactions
      const batch = await prisma.cashbookBatch.findUnique({
        where: { id: batchId },
        include: {
          transactions: {
            where: { status: 'PENDING' }
          }
        }
      });
      
      if (!batch) {
        throw new Error('Batch not found');
      }
      
      if (batch.status === 'POSTED') {
        throw new Error('Batch already posted');
      }
      
      // 2. Create journal entries for all transactions
      for (const transaction of batch.transactions) {
        // Create journal entry (reuse existing logic)
        const journalEntry = await this.createJournalEntry(transaction, userId);
        
        // Update transaction status
        await prisma.cashbookEntry.update({
          where: { id: transaction.id },
          data: {
            status: 'POSTED',
            journalEntryId: journalEntry.id
          }
        });
      }
      
      // 3. Update batch status
      await prisma.cashbookBatch.update({
        where: { id: batchId },
        data: { status: 'POSTED' }
      });
      
      console.log(`✅ Batch posted successfully: ${batchId}`);
      
      return {
        batchId,
        totalTransactions: batch.transactions.length,
        status: 'POSTED'
      };
      
    } catch (error: any) {
      console.error('❌ Error posting batch:', error.message);
      throw error;
    }
  }
  
  /**
   * Create journal entry for transaction
   */
  private static async createJournalEntry(transaction: any, userId: string): Promise<any> {
    const referenceNumber = `CB-${transaction.id.substring(transaction.id.length - 8).toUpperCase()}`;
    
    // Fetch bank details
    const bank = await prisma.bank.findUnique({
      where: { id: transaction.bankId },
      include: { currency: true }
    });
    
    if (!bank) {
      throw new Error('Bank account not found');
    }
    
    const journalEntry = await prisma.journalEntry.create({
      data: {
        transactionDate: transaction.transactionDate,
        referenceNumber,
        description: `Cashbook ${transaction.type}: ${transaction.description}`,
        totalAmount: transaction.amount,
        currencyId: bank.currency.id,
        status: 'POSTED',
        createdById: userId
      }
    });
    
    // Create journal entry lines for double-entry accounting
    if (transaction.type === 'RECEIPT') {
      // Receipt: Dr. Bank, Cr. Customer/GL Account
      
      // 1. Debit Bank Account
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: bank.glAccountId,
          debitAmount: transaction.amount,
          creditAmount: new Decimal(0),
          description: `Bank receipt: ${transaction.description}`
        }
      });
      
      // 2. Credit Customer/GL Account
      let contraAccountId: string;
      if (transaction.counterpartyType === 'CUSTOMER' && transaction.customerId) {
        // Use Accounts Receivable account for customer receipts
        const arAccount = await prisma.chartOfAccounts.findFirst({
          where: { 
            accountNo: '1200', // Accounts Receivable
            isActive: true 
          }
        });
        if (!arAccount) {
          throw new Error('Accounts Receivable account not found. Please create account code 1200.');
        }
        contraAccountId = arAccount.id;
      } else if (transaction.counterpartyType === 'GL' && transaction.glAccountId) {
        contraAccountId = transaction.glAccountId;
      } else {
        throw new Error('Invalid counterparty for receipt');
      }
      
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: contraAccountId,
          debitAmount: new Decimal(0),
          creditAmount: transaction.amount,
          description: `Receipt from: ${transaction.description}`
        }
      });
      
    } else if (transaction.type === 'PAYMENT') {
      // Payment: Dr. Supplier/GL Account, Cr. Bank
      
      // 1. Debit Supplier/GL Account
      let contraAccountId: string;
      if (transaction.counterpartyType === 'SUPPLIER' && transaction.vendorId) {
        // Use Accounts Payable account for vendor payments
        const apAccount = await prisma.chartOfAccounts.findFirst({
          where: { 
            accountNo: '2000', // Accounts Payable
            isActive: true 
          }
        });
        if (!apAccount) {
          throw new Error('Accounts Payable account not found. Please create account code 2000.');
        }
        contraAccountId = apAccount.id;
      } else if (transaction.counterpartyType === 'GL' && transaction.glAccountId) {
        contraAccountId = transaction.glAccountId;
      } else {
        throw new Error('Invalid counterparty for payment');
      }
      
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: contraAccountId,
          debitAmount: transaction.amount,
          creditAmount: new Decimal(0),
          description: `Payment to: ${transaction.description}`
        }
      });
      
      // 2. Credit Bank Account
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: bank.glAccountId,
          debitAmount: new Decimal(0),
          creditAmount: transaction.amount,
          description: `Bank payment: ${transaction.description}`
        }
      });
    }
    
    return journalEntry;
  }
  
  /**
   * Get batch details with transactions
   */
  static async getBatchDetails(batchId: string): Promise<any> {
    const batch = await prisma.cashbookBatch.findUnique({
      where: { id: batchId },
      include: {
        transactions: {
          include: {
            bank: true,
            customer: true,
            vendor: true,
            glAccount: true
          }
        }
      }
    });
    
    if (!batch) {
      throw new Error('Batch not found');
    }
    
    return batch;
  }
  
  /**
   * List all batches with pagination and filtering
   */
  static async listBatches(
    page: number = 1,
    limit: number = 10,
    status?: string,
    userId?: string
  ): Promise<{
    batches: any[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      
      const whereClause: any = {};
      if (status) {
        whereClause.status = status;
      }
      if (userId) {
        whereClause.createdById = userId;
      }
      
      const [batches, totalCount] = await Promise.all([
        prisma.cashbookBatch.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            transactions: {
              select: {
                id: true,
                type: true,
                amount: true,
                description: true,
                status: true
              }
            },
            createdBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }),
        prisma.cashbookBatch.count({ where: whereClause })
      ]);
      
      const totalPages = Math.ceil(totalCount / limit);
      
      return {
        batches,
        totalCount,
        totalPages,
        currentPage: page
      };
      
    } catch (error: any) {
      console.error('❌ Error listing batches:', error.message);
      throw new Error(`Failed to list batches: ${error.message}`);
    }
  }
  
  /**
   * Update batch details
   */
  static async updateBatch(
    batchId: string,
    updateData: {
      name?: string;
      description?: string;
      status?: string;
    },
    userId: string
  ): Promise<any> {
    try {
      // Check if batch exists and user has permission
      const existingBatch = await prisma.cashbookBatch.findUnique({
        where: { id: batchId }
      });
      
      if (!existingBatch) {
        throw new Error('Batch not found');
      }
      
      if (existingBatch.createdById !== userId) {
        throw new Error('You do not have permission to update this batch');
      }
      
      if (existingBatch.status === 'POSTED') {
        throw new Error('Cannot update a posted batch');
      }
      
      const updatedBatch = await prisma.cashbookBatch.update({
        where: { id: batchId },
        data: {
          ...updateData,
          updatedAt: new Date()
        },
        include: {
          transactions: {
            include: {
              bank: true,
              customer: true,
              vendor: true,
              glAccount: true
            }
          }
        }
      });
      
      console.log(`✅ Batch updated: ${batchId}`);
      return updatedBatch;
      
    } catch (error: any) {
      console.error('❌ Error updating batch:', error.message);
      throw new Error(`Failed to update batch: ${error.message}`);
    }
  }
  
  /**
   * Delete batch (only if not posted)
   */
  static async deleteBatch(batchId: string, userId: string): Promise<any> {
    try {
      // Check if batch exists and user has permission
      const existingBatch = await prisma.cashbookBatch.findUnique({
        where: { id: batchId },
        include: { transactions: true }
      });
      
      if (!existingBatch) {
        throw new Error('Batch not found');
      }
      
      if (existingBatch.createdById !== userId) {
        throw new Error('You do not have permission to delete this batch');
      }
      
      if (existingBatch.status === 'POSTED') {
        throw new Error('Cannot delete a posted batch');
      }
      
      // Delete all transactions first
      await prisma.cashbookEntry.deleteMany({
        where: { batchId: batchId }
      });
      
      // Delete the batch
      await prisma.cashbookBatch.delete({
        where: { id: batchId }
      });
      
      console.log(`✅ Batch deleted: ${batchId}`);
      return { success: true, message: 'Batch deleted successfully' };
      
    } catch (error: any) {
      console.error('❌ Error deleting batch:', error.message);
      throw new Error(`Failed to delete batch: ${error.message}`);
    }
  }

  /**
   * Export batch to CSV format
   */
  static async exportBatch(batchId: string, userId: string): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      
      // Get batch with all transactions and related data
      const batch = await prisma.cashbookBatch.findUnique({
        where: { id: batchId },
        include: {
          createdBy: true,
          transactions: {
            include: {
              bank: true,
              customer: true,
              vendor: true,
              glAccount: true
            }
          }
        }
      });

      if (!batch) {
        return { success: false, message: 'Batch not found' };
      }

      // Check if user has permission to view this batch
      if (batch.createdById !== userId) {
        return { success: false, message: 'You can only export batches you created' };
      }

      // Convert transactions to CSV format
      const csvData = batch.transactions.map(transaction => ({
        bankId: transaction.bankId,
        transactionDate: transaction.transactionDate.toISOString().split('T')[0],
        description: transaction.description || '',
        amount: transaction.amount.toString(),
        reference: transaction.reference || '',
        counterpartyType: transaction.counterpartyType,
        customerId: transaction.customerId || '',
        vendorId: transaction.vendorId || '',
        glAccountId: transaction.glAccountId || '',
        vatCode: transaction.vatCode || '',
        projectCode: transaction.projectCode || '',
        discount: transaction.discount?.toString() || '0',
        status: transaction.status,
        type: transaction.type
      }));

      // Create CSV content
      const headers = [
        'bankId',
        'transactionDate', 
        'description',
        'amount',
        'reference',
        'counterpartyType',
        'customerId',
        'vendorId',
        'glAccountId',
        'vatCode',
        'projectCode',
        'discount',
        'status',
        'type'
      ];

      const csvContent = [
        headers.join(','),
        ...csvData.map(row => 
          headers.map(header => {
            const value = row[header] || '';
            // Escape commas and quotes in CSV
            return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
              ? `"${value.replace(/"/g, '""')}"` 
              : value;
          }).join(',')
        )
      ].join('\n');

      // Upload to remote server
      const fileName = `batch-export-${batchId}-${Date.now()}.csv`;
      const csvBuffer = Buffer.from(csvContent, 'utf-8');
      
      const uploadResult = await remoteUploadService.uploadSingleFile(
        {
          buffer: csvBuffer,
          originalname: fileName,
          mimetype: 'text/csv',
        },
        'cashbook-imports' // Use same type as imports
      );
      const downloadUrl = uploadResult.downloadURL;

      console.log(`✅ Batch exported: ${batchId}`);
      return {
        success: true,
        data: {
          batchId: batch.id,
          batchName: batch.name,
          totalTransactions: batch.transactions.length,
          exportUrl: downloadUrl,
          fileName: fileName,
          exportedAt: new Date().toISOString(),
          csvContent: csvContent // Include for immediate download
        },
        message: 'Batch exported successfully'
      };

    } catch (error: any) {
      console.error('❌ Error exporting batch:', error.message);
      return { success: false, message: `Failed to export batch: ${error.message}` };
    }
  }

  /**
   * Export all batches for a user
   */
  static async exportAllBatches(userId: string): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      
      // Get all batches for the user
      const batches = await prisma.cashbookBatch.findMany({
        where: { createdById: userId },
        include: {
          transactions: {
            include: {
              bank: true,
              customer: true,
              vendor: true,
              glAccount: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (batches.length === 0) {
        return { success: false, message: 'No batches found to export' };
      }

      // Combine all transactions from all batches
      const allTransactions = batches.flatMap(batch => 
        batch.transactions.map(transaction => ({
          batchId: batch.id,
          batchName: batch.name,
          batchStatus: batch.status,
          batchCreatedAt: batch.createdAt.toISOString(),
          bankId: transaction.bankId,
          transactionDate: transaction.transactionDate.toISOString().split('T')[0],
          description: transaction.description || '',
          amount: transaction.amount.toString(),
          reference: transaction.reference || '',
          counterpartyType: transaction.counterpartyType,
          customerId: transaction.customerId || '',
          vendorId: transaction.vendorId || '',
          glAccountId: transaction.glAccountId || '',
          vatCode: transaction.vatCode || '',
          projectCode: transaction.projectCode || '',
          discount: transaction.discount?.toString() || '0',
          status: transaction.status,
          type: transaction.type
        }))
      );

      // Create CSV content
      const headers = [
        'batchId',
        'batchName',
        'batchStatus',
        'batchCreatedAt',
        'bankId',
        'transactionDate', 
        'description',
        'amount',
        'reference',
        'counterpartyType',
        'customerId',
        'vendorId',
        'glAccountId',
        'vatCode',
        'projectCode',
        'discount',
        'status',
        'type'
      ];

      const csvContent = [
        headers.join(','),
        ...allTransactions.map(row => 
          headers.map(header => {
            const value = row[header] || '';
            // Escape commas and quotes in CSV
            return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
              ? `"${value.replace(/"/g, '""')}"` 
              : value;
          }).join(',')
        )
      ].join('\n');

      // Upload to remote server
      const fileName = `all-batches-export-${userId}-${Date.now()}.csv`;
      const csvBuffer = Buffer.from(csvContent, 'utf-8');
      
      const uploadResult = await remoteUploadService.uploadSingleFile(
        {
          buffer: csvBuffer,
          originalname: fileName,
          mimetype: 'text/csv',
        },
        'cashbook-imports' // Use same type as imports
      );
      const downloadUrl = uploadResult.downloadURL;

      console.log(`✅ All batches exported for user: ${userId}`);
      return {
        success: true,
        data: {
          totalBatches: batches.length,
          totalTransactions: allTransactions.length,
          exportUrl: downloadUrl,
          fileName: fileName,
          exportedAt: new Date().toISOString(),
          csvContent: csvContent // Include for immediate download
        },
        message: 'All batches exported successfully'
      };

    } catch (error: any) {
      console.error('❌ Error exporting all batches:', error.message);
      return { success: false, message: `Failed to export batches: ${error.message}` };
    }
  }
}
