"use strict";

var getEntryChunks = (stats) => {
    return stats.chunks.filter(
        chunk => chunk.names.length
    );
}

var getChunkNameToIDMap = (stats) => {
    return getEntryChunks(stats).reduce(
        (map, chunk) => {
            chunk.names.forEach(
                (name) => { map[name] = chunk.id; }
            );
            return map;
        },
        {}
    );
}

var getChunkIDToNameMap = (stats) => {
    return getEntryChunks(stats).reduce(
        (map, chunk) => {
            chunk.names.forEach(
                (name) => { map[chunk.id] = name; }
            );
            return map;
        },
        {}
    );
}

var findChunk = function(root, targetID, history) {
    if (root.id == targetID) {
        return history;
    } else {
        for (var i = 0; i < root.children.length; i++) {
            var found = findChunk(root.children[i], targetID, history.concat(root.id));
            if (found) {
                return found;
            }
        }
    }
    return null;
};

function getChildrenForChunk(stats, parentChunk) {
    return getEntryChunks(stats).filter(
        (chunk) => chunk.parents.includes(parentChunk.id)
    ).map(
        (chunk) => ({
            id: chunk.id,
            names: chunk.names,
            children: getChildrenForChunk(stats, chunk),
        })
    );
}

var getEntryHeirarchy = (stats) => {
    return {
        id: null,
        children: getEntryChunks(stats)
            .filter((chunk) => chunk.parents.length == 0)
            .map((chunk) => ({
                id: chunk.id,
                names: chunk.names,
                children: getChildrenForChunk(stats, chunk),
            })),
    };
}

function getModulesByChunk(stats) {
    return Object.values(
        stats.modules.reduce(
            (map, module) => {
                module.chunks.forEach(
                    (chunk) => {
                        map[chunk] = (map[chunk] || {
                            id: chunk,
                            length: 0,
                            modules: [],
                        });
                        map[chunk].modules.push(module.identifier);
                        map[chunk].length = map[chunk].modules.length;
                    }
                );
                return map;
            },
            {}
        )
    );
}

function dedupe(list) {
    var mapper = {}
    list.forEach((item) => {
        mapper[item] = 1;
    });
    return Object.keys(mapper);
}

var getModulesByNamedChunk = (stats) => {
    const entryChunkIDs = getEntryChunks(stats).map(
        (chunk) => chunk.id
    );
    const modulesByChunk = getModulesByChunk(stats);

    return Object.values(
        modulesByChunk.reduce(
            (map, chunkWithModules) => {
                const chunkID = chunkWithModules.id;
                if (entryChunkIDs.indexOf(chunkID) > -1) {
                    map[chunkID] = modulesByChunk[chunkID];
                    // map[chunkID].modules = dedupe(map[chunkID].modules);
                } else {
                    map.shared.length += modulesByChunk[chunkID].modules.length;
                    map.shared.modules = dedupe(
                        map.shared.modules.concat(modulesByChunk[chunkID].modules)
                    );
                }
                return map;
            },
            {
                'shared': {
                    id: 'shared',
                    length: 0,
                    modules: [],
                }
            }
        )
    );
}

function getModulesWithReason(stats, identifier) {
    return stats.modules.filter(
        (module) => {
            return module.reasons.some(
                (reason) => reason.moduleIdentifier == identifier
            );
        }
    );
}

function isPromiseLoadedModuleName(moduleName) {
    return moduleName.startsWith('./~/promise-loader?');
}

function isLocaleRegexModuleName(moduleName) {
    return moduleName == './locale ./~/bundle-loader!^\\.\\/.*\\/lite\\.js$';
}

var listModulesWithDirectChildren = (stats, modulesByNamedChunk) => {
    const sharedChunk = modulesByNamedChunk.filter(
        (chunk) => chunk.id == 'shared'
    )[0];
    return stats.modules.map(
        (module) => {
            const nonAsyncParents = module.reasons.filter(
                (reason) => !isPromiseLoadedModuleName(reason.moduleName) &&
                    !isLocaleRegexModuleName(reason.moduleName)
            );
            const isEndOfSyncIncludes = isPromiseLoadedModuleName(module.name) ||
                isLocaleRegexModuleName(module.name);
            return {
                id: module.id,
                identifier: module.identifier,
                name: module.name,
                size: module.size,
                parentCount: module.reasons.length,
                asyncParents: module.reasons.filter(
                    (reason) => isPromiseLoadedModuleName(reason.moduleName) ||
                        isLocaleRegexModuleName(reason.moduleName)
                ),
                sharedParents: nonAsyncParents.filter(
                    (reason) => sharedChunk.modules.includes(reason.moduleIdentifier)
                ),
                entryParents: nonAsyncParents.filter(
                    (reason) => !sharedChunk.modules.includes(reason.moduleIdentifier)
                ),
                children: (
                    isEndOfSyncIncludes
                        ? []
                        : getModulesWithReason(stats, module.identifier).map(
                            (module) => ({
                                id: module.id,
                                identifier: module.identifier,
                                name: module.name,
                            })
                        )
                )
            };
        }
    );
}

function getSizes(moduleWithChildren, sizeOfChildren) {
    const total = moduleWithChildren.size + sizeOfChildren;
    const weighted = Math.round(total / (
        moduleWithChildren.sharedParents.length ||
        moduleWithChildren.entryParents.length ||
        1
    ));

    return {
        exclusive: moduleWithChildren.size,
        inclusive: sizeOfChildren,
        total: total,
        weighted: weighted,
        parents: moduleWithChildren.sharedParents,
    };
}

var getModulesWithSizes = (
    modulesWithChildren,
    modulesByNamedChunk
) => {
    // Sizes will be recorded/cached here for lookup
    const moduleSizes = {};

    function hasSize(moduleIdentifier) {
        return moduleIdentifier in moduleSizes;
    }
    function getSizeOfModule(moduleIdentifier, seenParents) {
        if (hasSize(moduleIdentifier)) {
            return moduleSizes[moduleIdentifier];
        }

        const moduleWithChildren = modulesWithChildren.filter(
            (module) => module.identifier == moduleIdentifier
        )[0];

        if (!moduleWithChildren) {
            console.error('no module for', moduleIdentifier);
            return;
        }

        const sizeOfChildren = moduleWithChildren.children.length == 0
            ? 0
            : moduleWithChildren.children.filter(
                    (child) => !seenParents.includes(child.identifier)
                ).map(
                    (child) => getSizeOfModule(
                        child.identifier,
                        seenParents.concat(child.identifier)
                    )
                ).reduce(
                    (sum, childSize) => sum + childSize.weighted,
                    0
                );

        moduleSizes[moduleWithChildren.identifier] = getSizes(
            moduleWithChildren,
            sizeOfChildren
        );

        return moduleSizes[moduleWithChildren.identifier];
    }

    modulesWithChildren.forEach(
        (moduleWithChildren) => {
            // this is already done, skip repeat processing
            if (hasSize(moduleWithChildren.identifier)) {
                return;
            }

            getSizeOfModule(moduleWithChildren.identifier, []);
        }
    );

    return moduleSizes;
}

