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
   * Download CSV file from Firebase Storage
   */
  static async downloadImportFile(filePath: string): Promise<Buffer> {
    try {
      console.log(`📥 Downloading file: ${filePath}`);
      
      // Create storage reference
      const storageRef = ref(storage, filePath);
      
      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);
      
      // Fetch file content
      const response = await fetch(downloadURL);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      console.log(`✅ File downloaded successfully: ${buffer.length} bytes`);
      
      return buffer;
      
    } catch (error: any) {
      console.error('❌ Error downloading file from Firebase:', error.message);
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }
  
  /**
   * Delete CSV file from Firebase Storage
   */
  static async deleteImportFile(filePath: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting file: ${filePath}`);
      
      // Create storage reference
      const storageRef = ref(storage, filePath);
      
      // Delete file
      await deleteObject(storageRef);
      
      console.log(`✅ File deleted successfully: ${filePath}`);
      
    } catch (error: any) {
      console.error('❌ Error deleting file from Firebase:', error.message);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }
  
  /**
   * List all import files for a user
   */
  static async listUserImportFiles(userId: string): Promise<string[]> {
    try {
      console.log(`📋 Listing import files for user: ${userId}`);
      
      // Create storage reference
      const storageRef = ref(storage, `cashbook-imports/${userId}`);
      
      // List all files
      const result = await listAll(storageRef);
      
      const filePaths = result.items.map(item => item.fullPath);
      
      console.log(`✅ Found ${filePaths.length} import files`);
      
      return filePaths;
      
    } catch (error: any) {
      console.error('❌ Error listing files from Firebase:', error.message);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }
  
  /**
   * Clean up old import files (older than 7 days)
   */
  static async cleanupOldImportFiles(userId: string, daysOld: number = 7): Promise<void> {
    try {
      console.log(`🧹 Cleaning up files older than ${daysOld} days for user: ${userId}`);
      
      // List all files
      const filePaths = await this.listUserImportFiles(userId);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      let deletedCount = 0;
      
      for (const filePath of filePaths) {
        try {
          // Extract date from file path (assuming format: import-{batchId}-{timestamp}.csv)
          const pathParts = filePath.split('/');
          const fileName = pathParts[pathParts.length - 1];
          const timestamp = fileName.split('-')[2]?.split('.')[0];
          
          if (timestamp) {
            const fileDate = new Date(parseInt(timestamp));
            
            if (fileDate < cutoffDate) {
              await this.deleteImportFile(filePath);
              deletedCount++;
            }
          }
        } catch (error) {
          console.warn(`⚠️ Could not process file: ${filePath}`);
        }
      }
      
      console.log(`✅ Cleaned up ${deletedCount} old files`);
      
    } catch (error: any) {
      console.error('❌ Error cleaning up files:', error.message);
      throw new Error(`Failed to cleanup files: ${error.message}`);
    }
  }
  
  /**
   * Get file metadata
   */
  static async getFileMetadata(filePath: string): Promise<{
    size: number;
    contentType: string;
    timeCreated: string;
    updated: string;
  }> {
    try {
      console.log(`📊 Getting metadata for file: ${filePath}`);
      
      // Create storage reference
      const storageRef = ref(storage, filePath);
      
      // Get download URL (this also gets metadata)
      const downloadURL = await getDownloadURL(storageRef);
      
      // Fetch file to get size
      const response = await fetch(downloadURL);
      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');
      
      return {
        size: contentLength ? parseInt(contentLength) : 0,
        contentType: contentType || 'application/octet-stream',
        timeCreated: new Date().toISOString(),
        updated: new Date().toISOString()
      };
      
    } catch (error: any) {
      console.error('❌ Error getting file metadata:', error.message);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }
}

export default FirebaseStorageService;


