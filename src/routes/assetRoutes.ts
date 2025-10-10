// @ts-nocheck
import express from 'express';
import { AssetController } from '../controllers/AssetController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Asset Management
router.post('/', AssetController.createAsset);
router.get('/', AssetController.getAssets);
router.get('/:id', AssetController.getAsset);
router.put('/:id', AssetController.updateAsset);
router.delete('/:id', AssetController.deleteAsset);

// Asset Operations
router.post('/:assetId/depreciation', AssetController.calculateDepreciation);
router.post('/:id/depreciate', AssetController.calculateDepreciation); // Alias for requirements
router.post('/depreciation/:depreciationId/post', AssetController.postDepreciation);
router.post('/:assetId/dispose', AssetController.disposeAsset);
router.post('/:id/dispose', AssetController.disposeAsset); // Alias for requirements

// Asset Reports
router.get('/register/asset-register', AssetController.getAssetRegister);
router.get('/register', AssetController.getAssetRegister); // Alias for requirements
router.get('/:assetId/depreciation-schedule', AssetController.getDepreciationSchedule);
router.get('/depreciation-schedule', AssetController.getDepreciationSchedule); // Alias for requirements
router.get('/dashboard/asset-dashboard', AssetController.getAssetDashboard);

// Additional Asset Methods
router.post('/depreciation/monthly', AssetController.postMonthlyDepreciation);
router.post('/depreciation/annual', AssetController.postAnnualDepreciation);
router.post('/:id/revalue', AssetController.revalueAsset);
router.get('/register/generate', AssetController.generateAssetRegister);
router.get('/depreciation-schedule/generate', AssetController.generateDepreciationSchedule);

export default router;
