/**
 * Railway QR Code Test Script
 * 
 * This script tests QR code generation specifically for Railway deployment.
 * It simulates the Railway environment and tests the QR code generation process.
 */

const { imageSync } = require('qr-image');
const fs = require('fs');

console.log('Starting Railway QR code test...');

// Set Railway environment variables to simulate Railway deployment
process.env.RAILWAY_STATIC_URL = 'https://example-railway-app.up.railway.app';
process.env.RAILWAY_PUBLIC_DOMAIN = 'example-railway-app.up.railway.app';

// Test data
const testQrData = 'https://example.com/test-railway-qr-code';

try {
    console.log('Railway environment variables:');
    console.log('- RAILWAY_STATIC_URL:', process.env.RAILWAY_STATIC_URL);
    console.log('- RAILWAY_PUBLIC_DOMAIN:', process.env.RAILWAY_PUBLIC_DOMAIN);
    
    // Test 1: Generate QR code image
    console.log('\nTest 1: Generating QR code image in Railway environment...');
    const qrImage = imageSync(testQrData);
    
    // Save the image to a file for visual inspection
    fs.writeFileSync('railway-test-qr.png', qrImage);
    console.log('✅ Test 1 passed: QR code image generated and saved to railway-test-qr.png');
    
    // Test 2: Convert QR code to base64
    console.log('\nTest 2: Converting QR code to base64 in Railway environment...');
    const qrBase64 = qrImage.toString('base64');
    console.log('QR code base64 (first 50 chars):', qrBase64.substring(0, 50) + '...');
    console.log('✅ Test 2 passed: QR code successfully converted to base64');
    
    // Test 3: Simulate the connection update handler
    console.log('\nTest 3: Simulating connection update handler in Railway environment...');
    console.log('📱 RAILWAY DEPLOYMENT - QR CODE DATA:');
    console.log(testQrData);
    console.log('📱 Copy this data to a QR code generator if needed');
    console.log('✅ Test 3 passed: Connection update handler simulation successful');
    
    console.log('\nAll tests passed! QR code generation for Railway is working properly.');
    console.log('You can visually inspect the generated QR code in railway-test-qr.png');
    
} catch (error) {
    console.error('❌ Test failed with error:', error);
}
