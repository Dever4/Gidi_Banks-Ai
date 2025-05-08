/**
 * QR Code Generation Test Script
 * 
 * This script tests the QR code generation functionality to ensure it works properly
 * in different environments, including Railway deployment.
 */

const { imageSync } = require('qr-image');
const QRCode = require('qrcode');
const fs = require('fs');

console.log('Starting QR code generation test...');

// Test data
const testQrData = 'https://example.com/test-qr-code';

// Test with qr-image
try {
    // Test 1: Generate QR code image with qr-image
    console.log('Test 1: Generating QR code image with qr-image...');
    const qrImage = imageSync(testQrData);
    
    // Save the image to a file for visual inspection
    fs.writeFileSync('test-qr-image.png', qrImage);
    console.log('✅ Test 1 passed: QR code image generated and saved to test-qr-image.png');
    
    // Test 2: Convert QR code to base64
    console.log('Test 2: Converting QR code to base64...');
    const qrBase64 = qrImage.toString('base64');
    console.log('QR code base64 (first 50 chars):', qrBase64.substring(0, 50) + '...');
    console.log('✅ Test 2 passed: QR code successfully converted to base64');
} catch (error) {
    console.error('❌ Test failed with qr-image:', error);
}

// Test with qrcode
try {
    // Test 3: Generate QR code image with qrcode
    console.log('\nTest 3: Generating QR code image with qrcode...');
    QRCode.toFile('test-qrcode.png', testQrData, {
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    }, function(err) {
        if (err) throw err;
        console.log('✅ Test 3 passed: QR code image generated and saved to test-qrcode.png');
    });
    
    // Test 4: Generate QR code as data URL
    console.log('Test 4: Generating QR code as data URL...');
    QRCode.toDataURL(testQrData, function(err, url) {
        if (err) throw err;
        console.log('QR code data URL (first 50 chars):', url.substring(0, 50) + '...');
        console.log('✅ Test 4 passed: QR code successfully generated as data URL');
    });
} catch (error) {
    console.error('❌ Test failed with qrcode:', error);
}

console.log('\nQR code generation test complete.');
