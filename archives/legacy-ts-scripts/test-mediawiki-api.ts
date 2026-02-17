/**
 * Test script for MediaWiki Action API functions
 * Tests category extraction, full content, and image retrieval
 * 
 * Usage:
 *   npx tsx scripts/test-mediawiki-api.ts
 */

import {
    getPageCategories,
    getPageContent,
    getPageImages,
    getImageUrl,
} from './lib/wikipedia';

async function testMediaWikiAPI() {
    console.log('🧪 Testing MediaWiki Action API Integration\n');
    console.log('='.repeat(60));

    // Test 1: Category Extraction
    console.log('\n📂 Test 1: Category Extraction');
    console.log('-'.repeat(60));

    const testTitles = [
        'Squid Game',
        'Parasite (2019 film)',
        'My Neighbor Totoro',
    ];

    for (const title of testTitles) {
        console.log(`\nTesting: "${title}"`);
        const categories = await getPageCategories(title, 'en');
        console.log(`Result: ${categories.length} categories`);
        if (categories.length > 0) {
            console.log(`Top 10: ${categories.slice(0, 10).join(' | ')}`);
        }
    }

    // Test 2: Full Page Content
    console.log('\n\n📄 Test 2: Full Page Content (Section 0 - Intro)');
    console.log('-'.repeat(60));

    for (const title of testTitles.slice(0, 1)) { // Test only first to save API calls
        console.log(`\nTesting: "${title}"`);
        const content = await getPageContent(title, 'en', 0);
        if (content) {
            const preview = content.substring(0, 200).replace(/<[^>]*>/g, ''); // Strip HTML for preview
            console.log(`Result: ${content.length} chars`);
            console.log(`Preview: ${preview}...`);
        } else {
            console.log('Result: No content found');
        }
    }

    // Test 3: Image Discovery
    console.log('\n\n🖼️  Test 3: Image Discovery');
    console.log('-'.repeat(60));

    for (const title of testTitles.slice(0, 2)) { // Test first two
        console.log(`\nTesting: "${title}"`);
        const images = await getPageImages(title, 'en');
        console.log(`Result: ${images.length} images`);
        if (images.length > 0) {
            console.log(`First 5: ${images.slice(0, 5).join(' | ')}`);
        }
    }

    // Test 4: Image URL Retrieval
    console.log('\n\n🔗 Test 4: Image URL Retrieval');
    console.log('-'.repeat(60));

    // Get images from first title and fetch URL for first image
    const firstTitleImages = await getPageImages(testTitles[0], 'en');
    if (firstTitleImages.length > 0) {
        const firstImage = firstTitleImages[0];
        console.log(`\nFetching URL for: ${firstImage}`);

        // Get thumbnail
        const thumbUrl = await getImageUrl(firstImage, 300);
        console.log(`Thumbnail (300px): ${thumbUrl}`);

        // Get full size
        const fullUrl = await getImageUrl(firstImage);
        console.log(`Full size: ${fullUrl}`);
    } else {
        console.log('No images to test URL retrieval');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ MediaWiki API Tests Complete\n');
}

// Run tests
testMediaWikiAPI().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
