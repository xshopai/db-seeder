#!/usr/bin/env node

import { ReviewValidator } from './utils/review-validator.js';
import { logger } from './utils/logger.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  try {
    logger.header('🔍 Review Data Validation - Business Logic Check');

    const validator = new ReviewValidator();
    const { valid, invalid, violations } = validator.validateReviews();

    if (invalid.length > 0) {
      logger.error('');
      logger.error('🚨 CRITICAL BUSINESS LOGIC VIOLATIONS DETECTED!');
      logger.error('');
      logger.error('The following reviews violate the business rule:');
      logger.error('"Users can only review products they have purchased"');
      logger.error('');

      violations.forEach((violation) => {
        logger.error(`   ${violation}`);
      });

      logger.error('');
      logger.error('💡 Recommendation: Generate new reviews based on actual purchase history');

      // Ask if user wants to fix the data
      const shouldFix = process.argv.includes('--fix');

      if (shouldFix) {
        logger.info('');
        logger.info('🔧 Generating valid reviews based on actual purchase history...');

        const validReviews = validator.generateValidReviews();
        const reviewsPath = join(process.cwd(), 'src', 'data', 'reviews.json');

        // Backup original file
        const backupPath = join(process.cwd(), 'src', 'data', 'reviews.json.backup');
        const originalData = require(reviewsPath);
        writeFileSync(backupPath, JSON.stringify(originalData, null, 2));
        logger.info(`📁 Original reviews backed up to: ${backupPath}`);

        // Write new valid reviews
        writeFileSync(reviewsPath, JSON.stringify(validReviews, null, 2));
        logger.success(`✅ Generated ${validReviews.length} valid reviews and saved to ${reviewsPath}`);

        logger.info('');
        logger.info('🎉 Review data has been fixed! All reviews now comply with business logic.');
        logger.info('   - Users only review products they have actually purchased');
        logger.info('   - All reviews are marked as verified purchases');
        logger.info('   - Purchase history validates review eligibility');
      } else {
        logger.info('');
        logger.info('To automatically fix the review data, run:');
        logger.info('   npm run validate:reviews -- --fix');
      }
    } else {
      logger.success('');
      logger.success('🎉 All reviews are valid! Business logic compliance: 100%');
      logger.success('   - Every reviewer has purchased the product they are reviewing');
      logger.success('   - Review validation logic is working correctly');
    }
  } catch (error) {
    logger.error('Validation failed', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
