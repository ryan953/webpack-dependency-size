"use strict";

function addDragDrop(el, callback) {
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);

    function onDragOver(ev) {
        ev.preventDefault();
    }

    function onDrop(ev) {
        ev.preventDefault();

        var file = ev.dataTransfer.files[0];

        // onDragEnd();
        callback(file);
    }
}

function readFile(file, callback) {
    var reader = new FileReader();

    reader.onloadend = function(ev) {
        if (ev.target.readyState === FileReader.DONE) {
            callback(reader.result);
        }
    };

    reader.readAsText(file);
}
