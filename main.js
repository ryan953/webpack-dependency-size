function initFile(jsonText) {
    var stats = JSON.parse(jsonText);

    const _modulesByNamedChunk = getModulesByNamedChunk(stats);
    const _modulesWithChildren = listModulesWithDirectChildren(stats, _modulesByNamedChunk);
    const _modulesWithSizes = getModulesWithSizes(_modulesWithChildren, _modulesByNamedChunk);

    renderData({
        chunkNames: getChunkNameToIDMap(stats),
        chunkIDs: getChunkIDToNameMap(stats),
        chunksWithNames: getEntryChunks(stats),
        chunksByParent: getEntryHeirarchy(stats),
        modulesByNamedChunk: _modulesByNamedChunk,
        _modulesWithChildren: _modulesWithChildren,
        modulesWithSizes: _modulesWithSizes,
    });
}


function renderData(processedData) {
    window._entryParents = {};
    window._formattedData = {};
    window._processedData = processedData;

    processedData.modulesByNamedChunk.forEach(function(chunk) {
        var chunkParents = findChunk(processedData.chunksByParent, chunk.id, []);
        window._entryParents[chunk.id] = chunkParents ? chunkParents.filter(_ => _) : null;
        window._formattedData[chunk.id] = chunk.modules.map(function(name) {
            var withChildren = processedData._modulesWithChildren.filter(function(moduleWithChildren) {
                return moduleWithChildren.identifier == name;
            })[0];
            return Object.assign(
                {},
                processedData.modulesWithSizes[name],
                {
                    niceName: niceName(name),
                    name: name,
                    dependencies: withChildren.children,
                    dependencyCount: withChildren.children.length,
                    asyncParents: withChildren.asyncParents,
                    asyncParentCount: withChildren.asyncParents.length,
                    syncParents: withChildren.entryParents,
                    syncParentCount: withChildren.entryParents.length,
                    sharedParents: withChildren.sharedParents,
                    sharedParentCount: withChildren.sharedParents.length,
                }
            );
        });
    });

    // Setup page state
    window._sortBy = 'weighted';
    window._sortDirection = 'desc';
    window._filters = [];

    // Initial render
    renderEntrySelector(processedData); // needs to be rendered for the filters to read valid values
    renderEntryGraph(processedData);

    updateFilters();

    renderTable();
}
