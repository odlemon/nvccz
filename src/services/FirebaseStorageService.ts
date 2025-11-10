// @ts-nocheck
// Firebase Storage Service for Cashbook Import Files
// Handles CSV file uploads, storage, and cleanup

import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAjxju0tSJoLtKnwOVqLRTMkVkpZ_iEstw",
  authDomain: "otcebp.firebaseapp.com",
  projectId: "otcebp",
  storageBucket: "otcebp.appspot.com",
  messagingSenderId: "904504797201",
  appId: "1:904504797201:web:091e69c41ba296362fe9b0",
  measurementId: "G-RS3VTZWQ3D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

export class FirebaseStorageService {
  /**
   * Upload CSV file to Firebase Storage
   */
  static async uploadImportFile(
    file: Buffer,
    fileName: string,
    batchId: string,
    userId: string
  ): Promise<{ filePath: string; downloadURL: string }> {
    try {
      console.log(`📁 Uploading import file: ${fileName}`);

      // Create storage reference
      const storageRef = ref(storage, `cashbook-imports/${userId}/${batchId}/${fileName}`);

      // Upload file
      const snapshot = await uploadBytes(storageRef, file);

      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref);

      console.log(`✅ File uploaded successfully: ${snapshot.ref.fullPath}`);

      return {
        filePath: snapshot.ref.fullPath,
        downloadURL: downloadURL
      };

    } catch (error: any) {
      console.error('❌ Error uploading file to Firebase:', error.message);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Upload a financial report document for a portfolio company.
   */
  static async uploadFinancialReport(
    file: Buffer,
    portfolioCompanyId: string,
    reportId: string,
    fileName: string
  ): Promise<{ filePath: string; downloadURL: string }> {
    try {
      console.log(`📁 Uploading financial report ${fileName} for company ${portfolioCompanyId}`);

      const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storageRef = ref(storage, `financial-reports/${portfolioCompanyId}/${reportId}/${sanitizedName}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      return {
        filePath: snapshot.ref.fullPath,
        downloadURL
      };
    } catch (error: any) {
      console.error('❌ Error uploading financial report to Firebase:', error.message);
      throw new Error(`Failed to upload financial report: ${error.message}`);
    }
  }

  /**
   * Upload an application document to Firebase Storage.
   */
  static async uploadApplicationDocument(
    file: Buffer,
    fileName: string,
    applicationId: string,
    documentType: string
  ): Promise<{ filePath: string; downloadURL: string }> {
    try {
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const safeApplicationId = applicationId || 'unassigned';
      const safeDocumentType = documentType || 'GENERAL';
      const timestamp = Date.now();

      const storageRef = ref(
        storage,
        `application-documents/${safeApplicationId}/${safeDocumentType}/${timestamp}-${sanitizedName}`
      );

      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      return {
        filePath: snapshot.ref.fullPath,
        downloadURL
      };
    } catch (error: any) {
      console.error('❌ Error uploading application document to Firebase:', error.message);
      throw new Error(`Failed to upload application document: ${error.message}`);
    }
  }

  /**
   * Upload a term sheet document to Firebase Storage.
   */
  static async uploadTermSheetDocument(
    file: Buffer,
    fileName: string,
    termSheetId: string,
    documentType: string
  ): Promise<{ filePath: string; downloadURL: string }> {
    try {
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const safeTermSheetId = termSheetId || 'unassigned';
      const safeDocumentType = documentType || 'GENERAL';
      const timestamp = Date.now();

      const storageRef = ref(
        storage,
        `term-sheets/${safeTermSheetId}/${safeDocumentType}/${timestamp}-${sanitizedName}`
      );

      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      return {
        filePath: snapshot.ref.fullPath,
        downloadURL
      };
    } catch (error: any) {
      console.error('❌ Error uploading term sheet document to Firebase:', error.message);
      throw new Error(`Failed to upload term sheet document: ${error.message}`);
    }
  }

  /**
   * Download CSV file from Firebase Storage
   */
  static async downloadImportFile(filePath: string): Promise<Buffer> {
    try {
      console.log(`📥 Downloading file from Firebase: ${filePath}`);

      const storageRef = ref(storage, filePath);
      const url = await getDownloadURL(storageRef);
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();

      console.log(`✅ File downloaded successfully: ${filePath}`);

      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      console.error('❌ Error downloading file from Firebase:', error.message);
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  /**
   * Delete file from Firebase Storage
   */
  static async deleteFile(filePath: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting file from Firebase: ${filePath}`);

      const storageRef = ref(storage, filePath);
      await deleteObject(storageRef);

      console.log(`✅ File deleted successfully: ${filePath}`);
    } catch (error: any) {
      console.error('❌ Error deleting file from Firebase:', error.message);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * List all files under a specific path
   */
  static async listFiles(path: string): Promise<string[]> {
    try {
      console.log(`📄 Listing files in Firebase path: ${path}`);

      const storageRef = ref(storage, path);
      const result = await listAll(storageRef);

      const filePaths = result.items.map(item => item.fullPath);

      console.log(`✅ Found ${filePaths.length} file(s)`);

      return filePaths;
    } catch (error: any) {
      console.error('❌ Error listing files in Firebase:', error.message);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }
}

export default FirebaseStorageService;


