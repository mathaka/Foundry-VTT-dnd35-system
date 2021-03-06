/**
 * Perform a system migration for the entire World, applying migrations for Actors, Items, and Compendium packs
 * @return {Promise}      A Promise which resolves once the migration is completed
 */
export const migrateWorld = async function() {
  ui.notifications.info(`Applying D&D35E System Migration for version ${game.system.data.version}. Please stand by.`);
/** 
  // Migrate World Actors
  for ( let a of game.actors.entities ) {
    try {
      const updateData = migrateActorData(a.data);
      if ( !isObjectEmpty(updateData) ) {
        console.log(`Migrating Actor entity ${a.name}`);
        await a.update(updateData, {enforceTypes: false});
      }
    } catch(err) {
      console.error(err);
    }
  }
*/
  // Migrate World Items
  for ( let i of game.items.entities ) {
    try {
      const updateData = migrateItemData(i.data);
      if ( !isObjectEmpty(updateData) ) {
        console.log(`Migrating Item entity ${i.name}`);
        let a = await i.update(updateData);
        console.log(a);
        console.log(i);
      }
    } catch(err) {
      console.error(err);
    }
  }
/** 
  // Migrate Actor Override Tokens
  for ( let s of game.scenes.entities ) {
    try {
      const updateData = migrateSceneData(s.data);
      if ( !isObjectEmpty(updateData) ) {
        console.log(`Migrating Scene entity ${s.name}`);
        await s.update(updateData, {enforceTypes: false});
      }
    } catch(err) {
      console.error(err);
    }
  }

  // Migrate World Compendium Packs
  const packs = game.packs.filter(p => {
    return (p.metadata.package === "world") && ["Actor", "Item", "Scene"].includes(p.metadata.entity)
  });
  for ( let p of packs ) {
    await migrateCompendium(p);
  }
*/
  // Set the migration as complete
  game.settings.set("dnd35e", "systemMigrationVersion", game.system.data.version);
  ui.notifications.info(`D&D3.5E System Migration to version ${game.system.data.version} succeeded!`);
};

/* -------------------------------------------- */

/**
 * Apply migration rules to all Entities within a single Compendium pack
 * @param pack
 * @return {Promise}
 
export const migrateCompendium = async function(pack) {
  const entity = pack.metadata.entity;
  if ( !["Actor", "Item", "Scene"].includes(entity) ) return;

  // Begin by requesting server-side data model migration and get the migrated content
  await pack.migrate();
  const content = await pack.getContent();

  // Iterate over compendium entries - applying fine-tuned migration functions
  for ( let ent of content ) {
    try {
      let updateData = null;
      if (entity === "Item") updateData = migrateItemData(ent.data);
      else if (entity === "Actor") updateData = migrateActorData(ent.data);
      else if ( entity === "Scene" ) updateData = migrateSceneData(ent.data);
      if (!isObjectEmpty(updateData)) {
        expandObject(updateData);
        updateData["_id"] = ent._id;
        await pack.updateEntity(updateData);
        console.log(`Migrated ${entity} entity ${ent.name} in Compendium ${pack.collection}`);
      }
    } catch(err) {
      console.error(err);
    }
  }
  console.log(`Migrated all ${entity} entities from Compendium ${pack.collection}`);
};
*/
/* -------------------------------------------- */
/*  Entity Type Migration Helpers               */
/* -------------------------------------------- */

/**
 * Migrate a single Actor entity to incorporate latest data model changes
 * Return an Object of updateData to be applied
 * @param {Actor} actor   The actor to Update
 * @return {Object}       The updateData to apply
 */
export const migrateActorData = function(actor) {
  const updateData = {};

  // Actor Data Updates
  _migrateActorBonuses(actor, updateData);
  _migrateActorTraits(actor, updateData);

  // Flatten values and remove deprecated fields
  const toFlatten = ["details.background", "details.trait", "details.ideal", "details.bond", "details.flaw",
    "details.type", "details.environment", "details.cr", "details.source", "details.alignment", "details.race",
    "attributes.exhaustion", "attributes.inspiration", "attributes.prof", "attributes.spellcasting",
    "attributes.spellDC", "traits.size", "traits.senses", "currency.pp", "currency.gp", "currency.ep", "currency.sp",
    "currency.cp"
  ];
  _migrateFlattenValues(actor, updateData, toFlatten);
  _migrateRemoveDeprecated(actor, updateData, toFlatten);

  // Migrate Owned Items
  if ( !actor.items ) return updateData;
  let hasItemUpdates = false;
  const items = actor.items.map(i => {

    // Migrate the Owned Item
    let itemUpdate = migrateItemData(i);

    // Prepared, Equipped, and Proficient for NPC actors
    if ( actor.type === "npc" ) {
      if (getProperty(i.data, "preparation.prepared") === false) itemUpdate["data.preparation.prepared"] = true;
      if (getProperty(i.data, "equipped") === false) itemUpdate["data.equipped"] = true;
      if (getProperty(i.data, "proficient") === false) itemUpdate["data.proficient"] = true;
    }

    // Update the Owned Item
    if ( !isObjectEmpty(itemUpdate) ) {
      hasItemUpdates = true;
      return mergeObject(i, itemUpdate, {enforceTypes: false, inplace: false});
    } else return i;
  });
  if ( hasItemUpdates ) updateData.items = items;
  return updateData;
};

/* -------------------------------------------- */

/**
 * Migrate a single Item entity to incorporate latest data model changes
 * @param item
 */
export const migrateItemData = function(item) {
  const updateData = {};

  // Migrate General Properties
  _migrateSpellbook(item,updateData);
  _migrateStoredItems(item, updateData);


  /**  Flatten values and remove deprecated fields
  const toFlatten = ["ability", "attuned", "consumableType", "equipped", "identified", "quantity", "levels", "price",
    "proficient", "rarity", "requirements", "stealth", "strength", "source", "subclass", "weight", "weaponType",
    "school", "level"
  ];
  _migrateFlattenValues(item, updateData, toFlatten);
  _migrateRemoveDeprecated(item, updateData, toFlatten);
  */
  // Return the migrated update data
  return updateData;
};

/* -------------------------------------------- */

/**
 * Migrate a single Scene entity to incorporate changes to the data model of it's actor data overrides
 * Return an Object of updateData to be applied
 * @param {Object} scene  The Scene data to Update
 * @return {Object}       The updateData to apply
 */
export const migrateSceneData = function(scene) {
  const tokens = duplicate(scene.tokens);
  return {
    tokens: tokens.map(t => {
      if (!t.actorId || t.actorLink || !t.actorData.data) {
        t.actorData = {};
        return t;
      }
      const token = new Token(t);
      if ( !token.actor ) {
        t.actorId = null;
        t.actorData = {};
      } else if ( !t.actorLink ) {
        const updateData = migrateActorData(token.data.actorData);
        t.actorData = mergeObject(token.data.actorData, updateData);
      }
      return t;
    })
  };
};

/* -------------------------------------------- */
/*  Low level migration utilities
/* -------------------------------------------- */

/**
 * Migrate the actor bonuses object
 * @private
 */
function _migrateActorBonuses(actor, updateData) {
  const b = game.system.model.Actor.character.bonuses;
  for ( let k of Object.keys(actor.data.bonuses || {}) ) {
    if ( k in b ) updateData[`data.bonuses.${k}`] = b[k];
    else updateData[`data.bonuses.-=${k}`] = null;
  }
}

/* -------------------------------------------- */
const _migrateSpellbook = function(item,updateData) {
  const Spellbook = item.Spellbook;
  console.log(Spellbook);
  if ( Spellbook ) return updateData;
  updateData["Spellbook"] = [];
  console.log(updateData);
  return updateData;
};
const _migrateStoredItems = function(item,updateData) {
  const StoredItems = item.StoredItems;
  if ( StoredItems ) return updateData;
  updateData["StoredItems"] = [];
  return updateData;
};
/**
 * Migrate string format traits with a comma separator to an array of strings
 * @private
 */
const _migrateActorTraits = function(actor, updateData) {
  if ( !actor.data.traits ) return;
  const dt = invertObject(CONFIG.DND35E.damageTypes);
  const map = {
    "dr": dt,
    "di": dt,
    "dv": dt,
    "ci": invertObject(CONFIG.DND35E.conditionTypes),
    "languages": invertObject(CONFIG.DND35E.languages)
  };
  for ( let [t, choices] of Object.entries(map) ) {
    const trait = actor.data.traits[t];
    if ( trait && (typeof trait.value === "string") ) {
      updateData[`data.traits.${t}.value`] = trait.value.split(",").map(t => choices[t.trim()]).filter(t => !!t);
    }
  }
};

/* -------------------------------------------- */


/**
 * Flatten several attributes which currently have an unnecessarily nested {value} object
 * @private
 */
const _migrateFlattenValues = function(ent, updateData, toFlatten) {
  for ( let a of toFlatten ) {
    const attr = getProperty(ent.data, a);
    if ( attr instanceof Object && !updateData.hasOwnProperty("data."+a) ) {
      updateData["data."+a] = attr.hasOwnProperty("value") ? attr.value : null;
    }
  }
};

/* -------------------------------------------- */
/*  General Migrations                          */
/* -------------------------------------------- */

/* -------------------------------------------- */

/**
 * Migrate from a string duration field like "1 Minute" to separate fields for duration units and numeric value
 * @private
 */

/* -------------------------------------------- */


/**
 * A general migration to remove all fields from the data model which are flagged with a _deprecated tag
 * @private
 */
const _migrateRemoveDeprecated = function(ent, updateData, toFlatten) {
  const flat = flattenObject(ent.data);

  // Deprecate entire objects
  const toDeprecate = Object.entries(flat).filter(e => e[0].endsWith("_deprecated") && (e[1] === true)).map(e => {
    let parent = e[0].split(".");
    parent.pop();
    return parent.join(".");
  });
  for ( let k of toDeprecate ) {
    let parts = k.split(".");
    parts[parts.length-1] = "-=" + parts[parts.length-1];
    updateData[`data.${parts.join(".")}`] = null;
  }

  // Deprecate types and labels
  for ( let [k, v] of Object.entries(flat) ) {
    let parts = k.split(".");
    parts.pop();

    // Skip any fields which have already been touched by other migrations
    if ( toDeprecate.some(f => k.startsWith(f) ) ) continue;
    if ( toFlatten.some(f => k.startsWith(f)) ) continue;
    if ( updateData.hasOwnProperty(`data.${k}`) ) continue;

    // Remove the data type field
    const dtypes = ["Number", "String", "Boolean", "Array", "Object"];
    if ( k.endsWith("type") && dtypes.includes(v) ) {
      updateData[`data.${k.replace(".type", ".-=type")}`] = null;
    }

    // Remove string label
    else if ( k.endsWith("label") ) {
      updateData[`data.${k.replace(".label", ".-=label")}`] = null;
    }
  }
};

/* -------------------------------------------- */




/**
 * Migrate from a target string like "15 ft. Radius" to a more explicit data model with a value, units, and type
 * @private
 */
const _migrateTarget = function(item, updateData) {
  const target = item.data.target;
  if ( target.value && !Number.isNumeric(target.value) ) {

    // Target Type
    let type = null;
    for ( let t of Object.keys(CONFIG.DND35E.targetTypes) ) {
      let rgx = new RegExp(t, "i");
      if ( rgx.test(target.value) ) {
        type = t;
        continue;
      }
    }

    // Target Units
    let units = null;
    if ( /ft/i.test(target.value) ) units = "ft";
    else if ( /mi/i.test(target.value) ) units = "mi";
    else if ( /touch/i.test(target.value) ) units = "touch";

    // Target Value
    let value = null;
    let match = target.value.match(/([\d]+)([\w\s]+)?/);
    if ( match ) value = Number(match[1]);
    else if ( /one/i.test(target.value) ) value = 1;
    updateData["data.target"] = {type, units, value};
  }
};

/* -------------------------------------------- */

/**
 * Migrate from string based components like "V,S,M" to boolean flags for each component
 * Move concentration and ritual flags into the components object
 * @private
 */
const _migrateSpellComponents = function(item, updateData) {
  const components = item.data.components;
  if ( !components.value ) return;
  let comps = components.value.toUpperCase().replace(/\s/g, "").split(",");
  updateData["data.components"] = {
    value: "",
    vocal: comps.includes("V"),
    somatic: comps.includes("S"),
    material: comps.includes("M"),
    concentration: item.data.concentration.value === true,
    ritual: item.data.ritual.value === true
  };
};

/* -------------------------------------------- */

/**
 * Migrate from a simple object with save.value to an expanded object where the DC is also configured
 * @deprecated in 0.5.2
 * @private
 */
const _migrateSpellAction = function(item, updateData) {

  // Set default action type for spells
  if ( item.data.spellType && !item.data.actionType ) {
    updateData["data.actionType"] = {
      "attack": "rsak",
      "save": "save",
      "heal": "heal",
      "utility": "util",
    }[item.data.spellType.value] || "util";
  }

  // Spell saving throw
  const save = item.data.save;
  if ( !save.value ) return;
  updateData["data.save"] = {
    ability: save.value,
    dc: null
  };
  updateData["data.save.-=value"] = null;
};

/* -------------------------------------------- */

/**
 * Migrate spell preparation data to the new preparation object
 * @deprecated in 0.5.2
 * @private
 */
const _migrateSpellPreparation = function(item, updateData) {
  const prep = item.data.preparation;
  if ( prep && !prep.mode ) {
    updateData["data.preparation.mode"] = "prepared";
    updateData["data.preparation.prepared"] = item.data.prepared ? Boolean(item.data.prepared.value) : false;
  }
};

/* -------------------------------------------- */

/**
 * Migrate from a string based weapon properties like "Heavy, Two-Handed" to an object of boolean flags
 * @private
 */
const _migrateWeaponProperties = function(item, updateData) {

  // Set default action type for weapons
  updateData["data.actionType"] = {
    "simpleM": "mwak",
    "simpleR": "rwak",
    "martialM": "mwak",
    "martialR": "rwak",
    "exoticM": "mwak",
    "exoticR": "rwak",
    "natural": "mwak",
    "improv": "mwak",
    "ammo": "rwak"
  }[item.data.weaponType.value] || "mwak";


  // Map weapon property strings to boolean flags
  const props = item.data.properties;
  if ( props.value ) {
    const labels = invertObject(CONFIG.DND35E.weaponProperties);
    for (let k of props.value.split(",").map(p => p.trim())) {
      if (labels[k]) updateData[`data.properties.${labels[k]}`] = true;
    }
    updateData["data.properties.-=value"] = null;
  }
};
