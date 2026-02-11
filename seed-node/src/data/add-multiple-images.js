import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the products JSON file
const productsPath = path.join(__dirname, 'products.json');
const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));

console.log(`Processing ${products.length} products...`);

// Update each product to have 4 images instead of 1
products.forEach((product, index) => {
  if (product.images && product.images.length === 1) {
    const baseImageUrl = product.images[0];
    
    // Extract the image ID from the URL
    // Example: "https://picsum.photos/id/100/800/800" -> 100
    const match = baseImageUrl.match(/\/id\/(\d+)\//);
    const baseId = match ? parseInt(match[1]) : 100 + index;
    
    // Add 3 more images with sequential IDs
    product.images = [
      `https://picsum.photos/id/${baseId}/800/800`,
      `https://picsum.photos/id/${baseId + 1}/800/800`,
      `https://picsum.photos/id/${baseId + 2}/800/800`,
      `https://picsum.photos/id/${baseId + 3}/800/800`
    ];
  }
});

// Write the updated products back to the file
fs.writeFileSync(productsPath, JSON.stringify(products, null, 2), 'utf-8');

console.log(`✅ Updated ${products.length} products with multiple images`);
console.log('Each product now has 4 images');
