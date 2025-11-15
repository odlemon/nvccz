const { initializeApp } = require('firebase/app');
const { getStorage, ref, listAll, deleteObject } = require('firebase/storage');

const firebaseConfig = {
  apiKey: "AIzaSyAjxju0tSJoLtKnwOVqLRTMkVkpZ_iEstw",
  authDomain: "otcebp.firebaseapp.com",
  projectId: "otcebp",
  storageBucket: "otcebp.appspot.com",
  messagingSenderId: "904504797201",
  appId: "1:904504797201:web:091e69c41ba296362fe9b0",
  measurementId: "G-RS3VTZWQ3D"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function deleteAllFirebaseFiles() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🗑️  DELETING ALL FIREBASE FILES');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Paths to clean up
    const paths = [
      'cashbook-imports',
      'financial-reports',
      'application-documents'
    ];

    let totalDeleted = 0;

    for (const path of paths) {
      console.log(`📁 Processing path: ${path}...`);
      
      try {
        const storageRef = ref(storage, path);
        const result = await listAll(storageRef);

        console.log(`   Found ${result.items.length} file(s) and ${result.prefixes.length} folder(s)`);

        // Delete all files
        for (const item of result.items) {
          try {
            await deleteObject(item);
            totalDeleted++;
            console.log(`   ✅ Deleted: ${item.fullPath}`);
          } catch (error) {
            console.error(`   ❌ Error deleting ${item.fullPath}: ${error.message}`);
          }
        }

        // Recursively delete files in subfolders
        for (const prefix of result.prefixes) {
          try {
            const subRef = ref(storage, prefix.fullPath);
            const subResult = await listAll(subRef);

            for (const item of subResult.items) {
              try {
                await deleteObject(item);
                totalDeleted++;
                console.log(`   ✅ Deleted: ${item.fullPath}`);
              } catch (error) {
                console.error(`   ❌ Error deleting ${item.fullPath}: ${error.message}`);
              }
            }
          } catch (error) {
            console.error(`   ❌ Error processing folder ${prefix.fullPath}: ${error.message}`);
          }
        }

        console.log(`   ✅ Completed path: ${path}\n`);
      } catch (error) {
        console.error(`   ❌ Error processing path ${path}: ${error.message}\n`);
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`✅ Total files deleted: ${totalDeleted}`);
    console.log('\n✅ Firebase cleanup completed!');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  }
}

deleteAllFirebaseFiles()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

