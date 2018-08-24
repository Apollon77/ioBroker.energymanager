/**
 *
 * energymanager adapter
 *
 */

'use strict';

const utils = require(__dirname + '/lib/utils');
const adapter = new utils.Adapter('energymanager');
var request = require('request');
let systemLanguage;
let nameTranslation;
let managerIntervall;
let valTagLang;

adapter.on('ready', function () {
    adapter.getForeignObject('system.config', function (err, obj) {
        if (err) {
            adapter.log.error(err);
            return;
        } else if (obj) {
            if (!obj.common.language) {
                adapter.log.info("Language not set. English set therefore.");
                nameTranslation = require(__dirname + '/admin/i18n/en/translations.json')
            } else {
                systemLanguage = obj.common.language;
                nameTranslation = require(__dirname + '/admin/i18n/' + systemLanguage + '/translations.json')
            }
            managerIntervall = setInterval(main, (adapter.config.managerIntervall * 1000));
            main();
        }
    });

});

adapter.on('unload', function (callback) {
    if (managerIntervall) clearInterval(managerIntervall);
});

function translateName(strName) {
    if(nameTranslation[strName]) {
        return nameTranslation[strName];
    } else {
        return strName;
    }
}

function main() {

    request(
        {
            url: "http://" + adapter.config.managerAddress + "/rest/kiwigrid/wizard/devices",
            json: true
        },
        function(error, response, content) {

            if (!error && response.statusCode == 200) {
                
                for (var i in content.result.items) {

                    for (var j in content.result.items[i].tagValues) {
                        
                        var valValue = content.result.items[i].tagValues[j].value;
                        valTagLang = translateName(content.result.items[i].tagValues[j].tagName);
                        var valType = typeof valValue;
                        var valTag = content.result.items[i].tagValues[j].tagName;
                        var strGroup;
                        var valUnit;
                        
                        switch (valType) {
                            case "boolean":
                                var valRole = 'indicator.working';
                                break;
                            
                            case "number":
                                if (valTag.search('Date') > -1){
                                    var valRole = 'value.datetime';
                                    valValue = new Date(valValue);
                                    break;
                                }
                                if (valTag.search('StateOfCharge') == 0){
                                    var valRole = 'value.battery';
                                    break;
                                }
                                if (valTag.search('PowerConsum') == 0 || valTag.search('Work') == 0){
                                    var valRole = 'value.power.consumption';
                                    break;
                                }
                                if (valTag.search('Temperature') == 0){
                                    var valRole = 'value.temperature';
                                    break;
                                }
                                if (valTag.search('Min') > -1 && valTag.search('Minute') == -1){
                                    var valRole = 'value.min';
                                    break;
                                }
                                if (valTag.search('Max') > -1){
                                    var valRole = 'value.max';
                                    break;
                                }
                                var valRole = 'value';
                                break;
                            
                            case "string":
                                var valRole = 'text';
                                break;

                            default:
                                var valRole = 'state';
                                break;
                        }

                        /* Round values up */
                        if (valTag.sarch(/CurrentBattery(In|Out)$|ResistanceBattery(Min|Max|Mean)$|VoltageBattery.*|VoltageGRM(Out|In)$/i) == 0) {
                            valValue = valValue.toFixed(2);
                        }

                        /* Try to detect the valValue units */
                        if (valTag.search('Work') == 0){
                            valValue = (valValue/1000).toFixed(2);
                            valUnit = 'kWh';
                        } else if (valTag.search('Temperature') == 0) {
                            valUnit = '°C';
                        } else if (valTag.search('Price') == 0) {
                            valUnit = 'ct/kWh';
                        } else if (valTag.search('Degree') == 0) {
                            valUnit = '°';
                        } else if (valTag.search('Voltage') == 0) { 
                            valUnit = 'V';
                        } else if (valTag.search('StateOf') == 0) { 
                            valUnit = '%';
                        } else if (valTag.search('Resistance') == 0) { 
                            valUnit = 'Ohm';
                        } else if (valTag.search('Power') == 0) { 
                            valValue = (valValue/1000).toFixed(2);   
                            valUnit = 'kW';
                        } else {
                            valUnit = '';
                        }

                        if (valValue != null && valType != 'object') {

                            switch(content.result.items[i].deviceModel[1].deviceClass) {
                                case "com.kiwigrid.devices.inverter.Inverter":
                                case "com.kiwigrid.devices.powermeter.PowerMeter":
                                    strGroup=translateName(content.result.items[i].deviceModel[2].deviceClass.split(".").pop());
                                break;
                
                                default:
                                    strGroup=translateName(content.result.items[i].deviceModel[1].deviceClass.split(".").pop());
                                break;
                            }

                            adapter.setObjectNotExists(
                                strGroup + "." + valTag, {
                                    type: 'state',
                                    common: {
                                        name: valTagLang,
                                        type: valType,
                                        read: true,
                                        write: false,
                                        unit: valUnit,
                                        role: valRole
                                    },
                                    native: {}
                                },
                                adapter.setState(
                                    strGroup + "." + valTag,
                                    {val: valValue, ack: true}
                                )
                            );

                        }
                        
                    }
                }

            } else {
                adapter.log.error(error);
            }
        }

    )
}
