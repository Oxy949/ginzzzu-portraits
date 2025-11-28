import dnd5e from "./dnd5e.js"
import daggerheart from "./daggerheart.js"
import pf2e from "./pf2e.js"
import { MODULE_ID } from "../../core/constants.js";

let system;

Hooks.on("init", ()=> {
    switch (game.system.id) {
        case "dnd5e":
            system = dnd5e;
            break;
        case "daggerheart":
            system = daggerheart;
            break;
        case "pf2e":
            system = pf2e;
            break;
        default:
            console.info(`No support for custom types for system ${game.system.id}`)
    }
});

//Each system must implement the following functions

/**
 * Add options specific to a system to the HTMLSelectElement.  options will be added to the DOM.
 * @param {HTMLSelectElement} sel the select element to which to add the options.
 */
export function addNpcDockOptions(sel) {
    try {
        const enabled = game.settings?.get ? game.settings.get(MODULE_ID, "showGroupActorsInSources") : true;
        if (!enabled) return;
    } catch (e) {
        // ignore and proceed
    }
    if (system) {
        system.addNpcDockOptions(sel);
    }
}

/**
 * Get filter criteria for t his s ystem, or undefined if there are none present.  BY convention, this should test against
 * a prefix, as flat strings are presumed to be folder names.
 * @param {*} folderSel the value against which to test criteria
 * @returns a value that will be passed to the filterNPC function, or, if undefined, there will be no filtering.
 */
export function getFilterCriteria(folderSel) {
    return system ? system.getFilterCriteria(folderSel) : undefined;
}

/**
 * Filter the NPC list
 * @param {*} filterCriteria the value against which to filter
 * @param {*} npcs the current full NPC list
 * @returns the list filtered by the criteria
 */
export function filterNpcs(filterCriteria, npcs) {      
      return system ? system.filterNpcs(filterCriteria, npcs) : npcs;
}