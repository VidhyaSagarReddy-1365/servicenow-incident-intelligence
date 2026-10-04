(function executeRule(current, previous /*null when async*/) {

    // 1. Human Override Protection
    // If an analyst has already populated the category manually, do not overwrite.
    var defaultCategories = ['inquiry', ''];
    var currentCategory = current.category.toString().toLowerCase();
    var userSetCategory = (currentCategory !== '' && defaultCategories.indexOf(currentCategory) === -1);
    
    if (userSetCategory) {
        gs.info('Incident Intelligence: Category manually set by user, skipping classification.');
        return;
    }

    // Combine short description and description for better context
    var textToAnalyze = current.short_description.toString() + ' ' + current.description.toString();

    // 2. Call the Engine
    var engine = new IncidentClassificationEngine();
    var result = engine.classify(textToAnalyze);

    // 3. Handle No Match
    if (!result.matched) {
        gs.info('Incident Intelligence: ' + result.message);
        return;
    }

    // 4. Apply Classification
    current.category = result.category;
    current.subcategory = result.subcategory;

    // 5. Resolve Assignment Group dynamically
    var groupGR = new GlideRecord('sys_user_group');
    groupGR.addQuery('name', result.assignment_group);
    groupGR.setLimit(1);
    groupGR.query();

    if (groupGR.next()) {
        current.assignment_group = groupGR.sys_id;
    } else {
        gs.warn('Incident Intelligence: Expected assignment group not found - ' + result.assignment_group);
    }

    // 6. Generate Explainable Audit Trail (Work Note)
    // By updating current.work_notes in a Before Insert rule, we avoid a secondary GlideRecord update.
    var workNote = [];
    workNote.push('[Incident Intelligence] Auto-Classification Applied');
    workNote.push('');
    workNote.push('Automatically categorized based on keyword analysis.');
    workNote.push('');
    workNote.push('Classification Details:');
    workNote.push('  Category         : ' + result.category);
    workNote.push('  Subcategory      : ' + result.subcategory);
    workNote.push('  Assignment Group : ' + result.assignment_group);
    workNote.push('  Confidence       : ' + result.confidence + ' (Score: ' + result.score + ')');
    workNote.push('  Matched Keywords : ' + result.matched_keywords);
    workNote.push('');
    workNote.push('If incorrect, update Category and Assignment Group manually.');

    current.work_notes = workNote.join('\n');

    gs.info('Incident Intelligence: Classified as ' + result.category + '/' + result.subcategory);

})(current, previous);
