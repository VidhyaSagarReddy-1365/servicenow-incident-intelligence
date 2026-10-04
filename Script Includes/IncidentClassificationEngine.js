var IncidentClassificationEngine = Class.create();

IncidentClassificationEngine.prototype = {

    initialize: function() {
        // We will retrieve configurable keyword rules from a custom table: x_inc_intel_keyword_map
        this.ruleTableName = 'x_inc_intel_keyword_map';
        this.rules = this._loadRules();
    },

    /**
     * Loads active classification rules from the configuration table.
     * If the table cannot be queried (e.g. doesn't exist yet), loads a default failsafe mapping.
     */
    _loadRules: function() {
        var rulesArray = [];
        var ruleGR = new GlideRecord(this.ruleTableName);
        
        if (ruleGR.isValid()) {
            ruleGR.addQuery('active', true);
            ruleGR.orderByDesc('weight'); // Process higher weights first if needed
            ruleGR.query();
            
            while (ruleGR.next()) {
                rulesArray.push({
                    keyword: ruleGR.getValue('keyword').toLowerCase(),
                    category: ruleGR.getValue('category'),
                    subcategory: ruleGR.getValue('subcategory'),
                    assignment_group: ruleGR.getValue('assignment_group'),
                    weight: parseInt(ruleGR.getValue('weight'), 10) || 1
                });
            }
        } 
        
        // Fallback to default mappings if the table is empty or invalid
        if (rulesArray.length === 0) {
            rulesArray = this._getDefaultMappings();
        }
        
        return rulesArray;
    },

    /**
     * Classifies an incident based on its description text.
     * @param {string} text - The incident short description and/or description.
     * @returns {Object} result - The classification result.
     */
    classify: function(text) {
        if (!text) {
            return this._noMatch('Input text is empty.');
        }

        var normalizedText = text.toLowerCase().trim().replace(/\s+/g, ' ');

        var bestMatch = null;
        var maxScore = 0;
        var matchedKeywords = [];

        // Evaluate all rules to find the highest scoring classification
        // A single classification map is evaluated based on how many of its keywords hit.
        // For this configurable model, we group keywords by their target classification.
        var scoreMap = {};

        for (var i = 0; i < this.rules.length; i++) {
            var rule = this.rules[i];
            
            if (normalizedText.indexOf(rule.keyword) !== -1) {
                var key = rule.category + '|' + rule.subcategory + '|' + rule.assignment_group;
                
                if (!scoreMap[key]) {
                    scoreMap[key] = {
                        category: rule.category,
                        subcategory: rule.subcategory,
                        assignment_group: rule.assignment_group,
                        score: 0,
                        keywords: []
                    };
                }
                
                scoreMap[key].score += rule.weight;
                scoreMap[key].keywords.push(rule.keyword);
            }
        }

        // Determine the best match
        for (var k in scoreMap) {
            if (scoreMap[k].score > maxScore) {
                maxScore = scoreMap[k].score;
                bestMatch = scoreMap[k];
            }
        }

        if (maxScore === 0 || !bestMatch) {
            return this._noMatch('No configured keywords matched the incident description.');
        }

        var confidence = this._calculateConfidence(maxScore);

        return {
            matched: true,
            category: bestMatch.category,
            subcategory: bestMatch.subcategory,
            assignment_group: bestMatch.assignment_group,
            confidence: confidence,
            score: maxScore,
            matched_keywords: bestMatch.keywords.join(', '),
            message: 'Successfully classified based on keyword scoring.'
        };
    },

    _calculateConfidence: function(score) {
        if (score >= 3) {
            return 'High';
        } else if (score === 2) {
            return 'Medium';
        } else {
            return 'Low';
        }
    },

    _noMatch: function(reason) {
        return {
            matched: false,
            category: '',
            subcategory: '',
            assignment_group: '',
            confidence: 'None',
            score: 0,
            matched_keywords: '',
            message: reason
        };
    },

    _getDefaultMappings: function() {
        return [
            { keyword: 'vpn', category: 'network', subcategory: 'vpn', assignment_group: 'Network Support', weight: 2 },
            { keyword: 'remote access', category: 'network', subcategory: 'vpn', assignment_group: 'Network Support', weight: 2 },
            { keyword: 'wifi', category: 'network', subcategory: 'wireless', assignment_group: 'Network Support', weight: 2 },
            { keyword: 'password', category: 'software', subcategory: 'account_management', assignment_group: 'IT Help Desk', weight: 3 },
            { keyword: 'locked out', category: 'software', subcategory: 'account_management', assignment_group: 'IT Help Desk', weight: 3 },
            { keyword: 'outlook', category: 'software', subcategory: 'email', assignment_group: 'Messaging Support', weight: 2 },
            { keyword: 'laptop', category: 'hardware', subcategory: 'desktop', assignment_group: 'Hardware Support', weight: 1 },
            { keyword: 'server down', category: 'software', subcategory: 'server', assignment_group: 'Infrastructure Support', weight: 3 }
        ];
    },

    type: 'IncidentClassificationEngine'
};
