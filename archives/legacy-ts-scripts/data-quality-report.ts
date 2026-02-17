import { supabase } from './lib/supabase';

interface QualityReport {
    report_type: string;
    total_checked: number;
    total_complete: number;
    total_issues: number;
    issues_by_field: Record<string, number>;
    priority_items: any[];
    created_at: string;
}

/**
 * Generate comprehensive data quality report
 */
async function generateReport() {
    console.log('📊 Generating Data Quality Report...\n');
    console.log('═══════════════════════════════════════════════════════');

    // Fetch latest reports
    const { data: reports, error } = await supabase
        .from('quality_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2);

    if (error || !reports || reports.length === 0) {
        console.error('❌ No quality reports found. Run validation scripts first.');
        return;
    }

    const contentReport = reports.find(r => r.report_type === 'content');
    const peopleReport = reports.find(r => r.report_type === 'people');

    // Summary
    console.log('\n🎯 OVERALL DATA QUALITY\n');

    if (contentReport) {
        const completePercent = Math.round((contentReport.total_complete / contentReport.total_checked) * 100);
        console.log(`📺 Content:`);
        console.log(`   Total: ${contentReport.total_checked}`);
        console.log(`   Complete: ${contentReport.total_complete} (${completePercent}%)`);
        console.log(`   Issues: ${contentReport.total_issues} (${100 - completePercent}%)\n`);
    }

    if (peopleReport) {
        const completePercent = Math.round((peopleReport.total_complete / peopleReport.total_checked) * 100);
        console.log(`👥 People:`);
        console.log(`   Total: ${peopleReport.total_checked}`);
        console.log(`   Complete: ${peopleReport.total_complete} (${completePercent}%)`);
        console.log(`   Issues: ${peopleReport.total_issues} (${100 - completePercent}%)\n`);
    }

    // Top issues
    console.log('───────────────────────────────────────────────────────');
    console.log('\n🔴 TOP MISSING FIELDS\n');

    if (contentReport) {
        console.log('Content Issues:');
        const topContentIssues = Object.entries(contentReport.issues_by_field as Record<string, number>)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        topContentIssues.forEach(([field, count], idx) => {
            console.log(`  ${idx + 1}. ${field}: ${count} items`);
        });
        console.log('');
    }

    if (peopleReport) {
        console.log('People Issues:');
        const topPeopleIssues = Object.entries(peopleReport.issues_by_field as Record<string, number>)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        topPeopleIssues.forEach(([field, count], idx) => {
            console.log(`  ${idx + 1}. ${field}: ${count} people`);
        });
        console.log('');
    }

    // Action items
    console.log('───────────────────────────────────────────────────────');
    console.log('\n✅ RECOMMENDED ACTIONS\n');

    const totalIssues = (contentReport?.total_issues || 0) + (peopleReport?.total_issues || 0);

    if (totalIssues > 500) {
        console.log('⚠️  HIGH priority - Run enrichment scripts immediately');
        console.log('   Suggested: Run enrich-content.ts and enrich-people.ts');
    } else if (totalIssues > 200) {
        console.log('⚡ MEDIUM priority - Schedule enrichment scripts');
        console.log('   Suggested: Run weekly via GitHub Actions');
    } else {
        console.log('✓ LOW priority - Data quality is good');
        console.log('  Suggested: Maintain with sync-changes.ts');
    }

    console.log('\n═══════════════════════════════════════════════════════\n');

    // Generate markdown summary for GitHub Actions
    generateMarkdownSummary(contentReport, peopleReport);
}

/**
 * Generate markdown summary for GitHub Actions step summary
 */
function generateMarkdownSummary(contentReport: QualityReport | undefined, peopleReport: QualityReport | undefined) {
    let markdown = '# 📊 Data Quality Report\n\n';

    markdown += '## Summary\n\n';
    markdown += '| Category | Total | Complete | Issues | Completion Rate |\n';
    markdown += '|----------|-------|----------|--------|-----------------|\n';

    if (contentReport) {
        const rate = Math.round((contentReport.total_complete / contentReport.total_checked) * 100);
        markdown += `| 📺 Content | ${contentReport.total_checked} | ${contentReport.total_complete} | ${contentReport.total_issues} | ${rate}% |\n`;
    }

    if (peopleReport) {
        const rate = Math.round((peopleReport.total_complete / peopleReport.total_checked) * 100);
        markdown += `| 👥 People | ${peopleReport.total_checked} | ${peopleReport.total_complete} | ${peopleReport.total_issues} | ${rate}% |\n`;
    }

    markdown += '\n## Top Missing Fields\n\n';

    if (contentReport) {
        markdown += '### Content\n\n';
        const topIssues = Object.entries(contentReport.issues_by_field as Record<string, number>)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        topIssues.forEach(([field, count]) => {
            markdown += `- **${field}**: ${count} items\n`;
        });
        markdown += '\n';
    }

    if (peopleReport) {
        markdown += '### People\n\n';
        const topIssues = Object.entries(peopleReport.issues_by_field as Record<string, number>)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        topIssues.forEach(([field, count]) => {
            markdown += `- **${field}**: ${count} people\n`;
        });
        markdown += '\n';
    }

    markdown += '## Next Steps\n\n';
    markdown += 'Run enrichment scripts to fill missing data:\n';
    markdown += '```bash\n';
    markdown += 'npx tsx scripts/enrich-content.ts\n';
    markdown += 'npx tsx scripts/enrich-people.ts\n';
    markdown += '```\n';

    // Save to file for GitHub Actions
    if (process.env.GITHUB_STEP_SUMMARY) {
        const fs = require('fs');
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
        console.log('✓ Report added to GitHub Actions step summary');
    }

    // Also print to console
    console.log('\n' + markdown);
}

// Main execution
async function main() {
    try {
        await generateReport();
    } catch (error) {
        console.error('❌ Report generation failed:', error);
        process.exit(1);
    }
}

main();
