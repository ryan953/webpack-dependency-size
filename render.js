"use strict";

function $(id) { return document.getElementById(id); }

function _() { return true; }

function makeBoolMatrix(field, enabledSetting, disabledSetting) {
    return function(record) {
        return (
            record[field] === true && enabledSetting === true ||
            record[field] === false && disabledSetting === true
        );
    };
}
function makeRange(field, limits) {
    return function(record) {
        if (limits.min && limits.max) {
            return record[field] >= limits.min && record[field] <= limits.max;
        }
        if (limits.min) {
            return record[field] >= limits.min;
        }
        if (limits.max) {
            return record[field] <= limits.max;
        }
        return true;
    };
}

function niceName(name) {
    return (name.indexOf('!') >= 0
        ? name.split('!').pop()
        : name).replace('/mnt/pinboard/', './');
}

function pick(field) {
    return function(obj) {
        return obj[field];
    };
}

function formatBytes(bytes) {
    if (bytes == 0) {
        return '0 B';
    }
    var k = 1000;
    var dm = 0;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function readFilterValues() {
    return {
        // showEntries: $('filter-isEntry-only').checked,
        // showNonEntries: $('filter-isEntry-dependants').checked,

        // showPromiseLoaded: $('filter-isPromiseLoaded-only').checked,
        // showNonPromiseLoaded: $('filter-isPromiseLoaded-dependants').checked,
        entryPoint: $('filter-entry-point').value,

        entryNameContains: $('filter-entry-like').value !== ''
            ? new RegExp($('filter-entry-like').value)
            : null,

        nameContains: $('filter-niceName-like').value !== ''
            ? new RegExp($('filter-niceName-like').value)
            : null,

        syncParents: {
            min: $('filter-syncParentCount-min').value,
            max: $('filter-syncParentCount-max').value,
        },
        asyncParents: {
            min: $('filter-asyncParentCount-min').value,
            max: $('filter-asyncParentCount-max').value,
        },
        sharedParents: {
            min: $('filter-sharedParentCount-min').value,
            max: $('filter-sharedParentCount-max').value,
        },

        exclusive: {
            min: $('filter-exclusive-min').value,
            max: $('filter-exclusive-max').value,
        },
        // inclusive: {
        //     min: $('filter-inclusive-min').value,
        //     max: $('filter-inclusive-max').value,
        // },

        total: {
            min: $('filter-total-min').value,
            max: $('filter-total-max').value,
        },
        weighted: {
            min: $('filter-weighted-min').value,
            max: $('filter-weighted-max').value,
        },

        dependencyCount: {
            min: $('filter-dependencyCount-min').value,
            max: $('filter-dependencyCount-max').value,
        },
    };
}

function updateFilters() {
    var settings = readFilterValues();

    window._filterSettings = settings;
    window._filters = [
        // makeBoolMatrix('isEntry', settings.showEntries, settings.showNonEntries),
        // makeBoolMatrix('isPromiseLoaded', settings.showPromiseLoaded, settings.showNonPromiseLoaded),

        function(record) {
            if (settings.entryNameContains && !settings.entryNameContains.test(record.niceName)) {
                return false;
            }
            return true;
        },

        function(record) {
            if (settings.nameContains && !settings.nameContains.test(record.niceName)) {
                return false;
            }
            return true;
        },

        makeRange('syncParentCount', settings.syncParents),
        makeRange('asyncParentCount', settings.asyncParents),
        makeRange('sharedParentCount', settings.sharedParents),

        makeRange('exclusive', settings.exclusive),
        // makeRange('inclusive', settings.inclusive),

        makeRange('total', settings.total),
        makeRange('weighted', settings.weighted),

        makeRange('dependencyCount', settings.dependencyCount),
    ];

    renderTable();
}

function sortBy(field) {
    if (window._sortBy === null || window._sortBy !== field) {
        window._sortBy = field;
        window._sortDirection = 'desc';
    } else {
        window._sortDirection = window._sortDirection === 'asc'
            ? 'desc'
            : 'asc';
    }

    renderTable();
}

function elem(name, attrs, children) {
    var el = document.createElement(name);
    if (attrs !== null) {
        Object.keys(attrs).forEach(function(key) {
            if (attrs[key] !== null) {
                el.setAttribute(key, attrs[key]);
            }
        });
    }
    if (children) {
        _elemAddChildren(el, children);
    }
    return el;
}

function _elemAddChildren(el, children) {
    if (!Array.isArray(children)) {
        children = [children];
    }
    children.forEach(function(child) {
        if (Array.isArray(child)) {
            _elemAddChildren(el, child);
        } else if (child.tagName) {
            el.appendChild(child);
        } else {
            el.textContent += child;
        }
    });
}

function renderEntryGraph(processedData) {
    var root = $('entry-graph');

    processedData.chunksByParent.children
        .map(renderEntryGraphNode)
        .forEach(function(node) {
            root.appendChild(node);
        });
}

function renderEntryGraphNode(chunk) {
    var children = chunk.children.map(renderEntryGraphNode);

    return elem('li', null, [
        elem('h5', null, [`${chunk.names.join(', ')} (${chunk.id})`]),
        elem('ul', null, children),
    ]);
}

function renderEntrySelector(data) {
    var root = $('filter-entry-point');
    var chunkNames = Object.keys(data.chunkNames);
    chunkNames.sort();

    var defaultID = data.chunksByParent.children[0].id;
    chunkNames.forEach(function(chunkName, i) {
        var chunkID = data.chunkNames[chunkName];
        root.appendChild(
            elem('option', {
                value: chunkID,
                selected: chunkID == defaultID ? 'selected' : null,
            }, `${chunkName} (${chunkID})`)
        );
    });
}

function renderTable() {
    if (!window._filterSettings.entryPoint) {
        return;
    }

    var interestingEntries = window._entryParents[window._filterSettings.entryPoint]
        .concat(window._filterSettings.entryPoint);
    var data = [];
    interestingEntries.forEach(function(entryID) {
        data = data.concat(
            window._formattedData[entryID]
                .map(function(record) {
                    return Object.assign({}, record, {
                        entryID: entryID,
                        entry: window._processedData.chunkIDs[entryID],
                    });
                })
        );
    });

    var sortBy = window._sortBy;
    var sortDirection = window._sortDirection;
    var filters = window._filters;

    switch (sortBy) {
        case 'entry':
        case 'niceName':
        case 'syncParentCount':
        case 'asyncParentCount':
        case 'sharedParentCount':
        case 'exclusive':
        case 'inclusive':
        case 'total':
        case 'weighted':
        case 'dependencyCount':
            data = data.sort(function(a, b) {
                if (a[sortBy] === b[sortBy]) { return 0; }
                return a[sortBy] < b[sortBy] ? -1 : 1;
            });
            break;
    }
    if (sortDirection == 'desc') {
        data.reverse();
    }

    var tBody = elem(
        'tbody',
        null,
        data.filter(function(record) {
            return filters.reduce(function(all, filter) {
                return all && filter(record);
            }, true);
        }).map(function(record) {
            return elem(
                'tr',
                null,
                [
                    elem('td', {class: 'hoverTrigger'}, [
                        record.entryID,
                        elem('div', {class: 'hoverPanel'}, record.entry),
                    ]),
                    elem('td', {class: 'hoverTrigger'}, [
                        elem('a', {
                            href: 'https://phabricator.pinadmin.com/diffusion/P/browse/master/' + record.niceName,
                        }, record.niceName),
                        elem('div', {class: 'hoverPanel'}, [record.name])
                    ]),

                    elem(
                        'td',
                        {class: 'hoverTrigger'},
                        [
                            record.asyncParentCount,
                            elem('ul', {class: 'hoverPanel'}, [
                                record.asyncParents
                                    .map(function(reason) {
                                        return elem('li', null, `${reason.moduleIdentifier} (${reason.moduleId})`);
                                    }),
                            ]),
                        ]
                    ),
                    elem(
                        'td',
                        {class: 'hoverTrigger'},
                        [
                            record.syncParentCount,
                            elem('ul', {class: 'hoverPanel'}, [
                                record.syncParents
                                    .map(function(reason) {
                                        return elem('li', null, `${reason.moduleIdentifier} (${reason.moduleId})`);
                                    }),
                            ]),
                        ]
                    ),
                    elem(
                        'td',
                        {class: 'hoverTrigger'},
                        [
                            record.sharedParentCount,
                            elem('ul', {class: 'hoverPanel'}, [
                                record.sharedParents
                                    .map(function(reason) {
                                        return elem('li', null, `${reason.moduleIdentifier} (${reason.moduleId})`);
                                    }),
                            ]),
                        ]
                    ),
                    elem('td', {class: 'hoverTrigger'} , [
                        formatBytes(record.exclusive),
                        elem('div', {class: 'hoverPanel'}, record.exclusive),
                    ]),
                    // elem('td', {class: 'hoverTrigger'}, [
                    //     formatBytes(record.inclusive),
                    //     elem('div', {class: 'hoverPanel'}, record.inclusive),
                    // ]),
                    elem('td', {class: 'hoverTrigger'}, [
                        formatBytes(record.total),
                        elem('div', {class: 'hoverPanel'}, record.total),
                    ]),
                    elem('td', {class: 'hoverTrigger'}, [
                        formatBytes(record.weighted),
                        elem('div', {class: 'hoverPanel'}, record.weighted),
                    ]),
                    elem(
                        'td',
                        {class: 'hoverTrigger'},
                        [
                            record.dependencies.length,
                            elem('ul', {class: 'hoverPanel'}, [
                                record.dependencies
                                    .map(function(module) {
                                        return elem('li', null, `${module.identifier} (${module.id})`);
                                    }),
                            ]),
                        ]
                    ),
                ]
            );
        })
    );
    tBody.setAttribute('id', 'data');
    $('data').replaceWith(tBody);
}
