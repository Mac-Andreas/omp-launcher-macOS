// macOS audio helper for the Beta "Audio fix".
//
// The game aborts (exit 3) when Wine's mmdevapi hits assert(!status) setting up
// the render audio client. Logs on CrossOver 26 / macOS 26 (Tahoe) / Apple
// Silicon show the real cause: building the 48kHz/32-bit-float stream for the
// default output device raises an illegal instruction (c000001d) *inside*
// Apple's native CoreAudio, which Wine turns into the assert+crash. This is a
// known CrossOver/Tahoe bug. Setting the sample rate does NOT help (proven by
// testing: 44.1 kHz on the built-in speakers still crashes). The only thing
// that reliably works is making Wine render to a *different* output device than
// the built-in speakers — plugging in AirPods/headphones avoids it.
//
// The audio route fix here does that programmatically, without bundling a
// third-party driver (BlackHole is GPL-3) and without any admin/coreaudiod
// install:
//   * If a real non-built-in output device is already present (AirPods, HDMI,
//     USB), we switch the system default output to it for the launch — the
//     proven path.
//   * Otherwise we create our OWN Aggregate Device wrapping the built-in
//     speakers (so the user still hears audio through the speakers) and switch
//     to it. Wine then builds its render stream against the aggregate's
//     CoreAudio object, not the raw built-in-speaker driver that faults.
// Either way the original default device is restored (and any aggregate we made
// is destroyed) when the game exits.
#![cfg(target_os = "macos")]

use log::{info, warn};

// --- CoreAudio HAL FFI. We bind only the few symbols we need rather than
// pulling in coreaudio-sys (which bindgens AudioToolbox/MIDI/OpenAL too). ---

type OSStatus = i32;
type AudioObjectID = u32;
type AudioObjectPropertySelector = u32;
type AudioObjectPropertyScope = u32;
type AudioObjectPropertyElement = u32;

#[repr(C)]
struct AudioObjectPropertyAddress {
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    element: AudioObjectPropertyElement,
}

const K_AUDIO_OBJECT_SYSTEM_OBJECT: AudioObjectID = 1;
const K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL: AudioObjectPropertyScope = fourcc(b"glob");
const K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT: AudioObjectPropertyScope = fourcc(b"outp");
const K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN: AudioObjectPropertyElement = 0;
const K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE: AudioObjectPropertySelector =
    fourcc(b"dOut");
const K_AUDIO_HARDWARE_PROPERTY_DEVICES: AudioObjectPropertySelector = fourcc(b"dev#");
const K_AUDIO_DEVICE_PROPERTY_TRANSPORT_TYPE: AudioObjectPropertySelector = fourcc(b"tran");
const K_AUDIO_DEVICE_PROPERTY_NOMINAL_SAMPLE_RATE: AudioObjectPropertySelector = fourcc(b"nsrt");
const K_AUDIO_OBJECT_PROPERTY_NAME: AudioObjectPropertySelector = fourcc(b"lnam");
const K_AUDIO_DEVICE_PROPERTY_DEVICE_UID: AudioObjectPropertySelector = fourcc(b"uid ");
const K_AUDIO_DEVICE_PROPERTY_STREAM_CONFIGURATION: AudioObjectPropertySelector = fourcc(b"slay");
const K_AUDIO_DEVICE_TRANSPORT_TYPE_BLUETOOTH: u32 = fourcc(b"blue");
const K_AUDIO_DEVICE_TRANSPORT_TYPE_BLUETOOTH_LE: u32 = fourcc(b"blea");
const K_AUDIO_DEVICE_TRANSPORT_TYPE_BUILT_IN: u32 = fourcc(b"bltn");

// Aggregate device description dictionary keys (AudioHardware.h).
const AGGREGATE_UID: &str = "uid";
const AGGREGATE_NAME: &str = "name";
const AGGREGATE_MAIN_SUBDEVICE: &str = "master";
const AGGREGATE_IS_PRIVATE: &str = "private";
const AGGREGATE_IS_STACKED: &str = "stacked";
const AGGREGATE_SUBDEVICE_LIST: &str = "subdevices";
const SUBDEVICE_UID: &str = "uid";

// Our aggregate's stable UID/name so we can find + clean up a stale one.
const OUR_AGGREGATE_UID: &str = "mp.open.launcher.audiofix.aggregate";
const OUR_AGGREGATE_NAME: &str = "open.mp Audio (fix)";

// Four-char-code helper: CoreAudio constants are big-endian packed ASCII.
const fn fourcc(b: &[u8; 4]) -> u32 {
    ((b[0] as u32) << 24) | ((b[1] as u32) << 16) | ((b[2] as u32) << 8) | (b[3] as u32)
}

type CFStringRef = *const std::ffi::c_void;
type CFDictionaryRef = *const std::ffi::c_void;
type CFArrayRef = *const std::ffi::c_void;
type CFTypeRef = *const std::ffi::c_void;
type CFAllocatorRef = *const std::ffi::c_void;
type CFIndex = isize;
const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;

#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyData(
        in_object_id: AudioObjectID,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const std::ffi::c_void,
        io_data_size: *mut u32,
        out_data: *mut std::ffi::c_void,
    ) -> OSStatus;
    fn AudioObjectSetPropertyData(
        in_object_id: AudioObjectID,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const std::ffi::c_void,
        in_data_size: u32,
        in_data: *const std::ffi::c_void,
    ) -> OSStatus;
    fn AudioObjectGetPropertyDataSize(
        in_object_id: AudioObjectID,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const std::ffi::c_void,
        out_data_size: *mut u32,
    ) -> OSStatus;
    fn AudioHardwareCreateAggregateDevice(
        in_description: CFDictionaryRef,
        out_device_id: *mut AudioObjectID,
    ) -> OSStatus;
    fn AudioHardwareDestroyAggregateDevice(in_device_id: AudioObjectID) -> OSStatus;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFTypeDictionaryKeyCallBacks: std::ffi::c_void;
    static kCFTypeDictionaryValueCallBacks: std::ffi::c_void;
    static kCFTypeArrayCallBacks: std::ffi::c_void;

    fn CFStringGetCString(
        the_string: CFStringRef,
        buffer: *mut std::os::raw::c_char,
        buffer_size: CFIndex,
        encoding: u32,
    ) -> bool;
    fn CFStringCreateWithCString(
        alloc: CFAllocatorRef,
        c_str: *const std::os::raw::c_char,
        encoding: u32,
    ) -> CFStringRef;
    fn CFDictionaryCreateMutable(
        allocator: CFAllocatorRef,
        capacity: CFIndex,
        key_callbacks: *const std::ffi::c_void,
        value_callbacks: *const std::ffi::c_void,
    ) -> *mut std::ffi::c_void;
    fn CFDictionarySetValue(
        the_dict: *mut std::ffi::c_void,
        key: *const std::ffi::c_void,
        value: *const std::ffi::c_void,
    );
    fn CFArrayCreateMutable(
        allocator: CFAllocatorRef,
        capacity: CFIndex,
        callbacks: *const std::ffi::c_void,
    ) -> *mut std::ffi::c_void;
    fn CFArrayAppendValue(the_array: *mut std::ffi::c_void, value: *const std::ffi::c_void);
    fn CFRelease(cf: *const std::ffi::c_void);
}

// A Rust &str -> owned CFString. Caller must CFRelease the result.
fn cfstr(s: &str) -> CFStringRef {
    let c = std::ffi::CString::new(s).unwrap();
    unsafe { CFStringCreateWithCString(std::ptr::null(), c.as_ptr(), K_CF_STRING_ENCODING_UTF8) }
}

/// The default output device, read just before launch so the dialog can be
/// specific about which device is in play.
pub struct OutputDevice {
    /// Human-readable name, e.g. "MacBook Pro Speakers" or "AirPods".
    pub name: Option<String>,
    /// True if it's the Mac's built-in output (the path that faults on Tahoe).
    pub built_in: bool,
    /// True if it's a Bluetooth device.
    pub bluetooth: bool,
    /// Current nominal sample rate in Hz (e.g. 44100, 48000, 96000), if read.
    pub sample_rate: Option<u32>,
}

fn addr(
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress {
        selector,
        scope,
        element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    }
}

fn default_output_device() -> Option<AudioObjectID> {
    let a = addr(
        K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
        K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    );
    let mut device: AudioObjectID = 0;
    let mut size = std::mem::size_of::<AudioObjectID>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &a,
            0,
            std::ptr::null(),
            &mut size,
            &mut device as *mut _ as *mut std::ffi::c_void,
        )
    };
    if status != 0 || device == 0 {
        warn!("[audio_fix] no default output device (status {})", status);
        return None;
    }
    Some(device)
}

// transport type -> (built_in, bluetooth)
fn transport_kind(device: AudioObjectID) -> (bool, bool) {
    let a = addr(
        K_AUDIO_DEVICE_PROPERTY_TRANSPORT_TYPE,
        K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    );
    let mut transport: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            device,
            &a,
            0,
            std::ptr::null(),
            &mut size,
            &mut transport as *mut _ as *mut std::ffi::c_void,
        )
    };
    if status != 0 {
        return (false, false);
    }
    let built_in = transport == K_AUDIO_DEVICE_TRANSPORT_TYPE_BUILT_IN;
    let bluetooth = transport == K_AUDIO_DEVICE_TRANSPORT_TYPE_BLUETOOTH
        || transport == K_AUDIO_DEVICE_TRANSPORT_TYPE_BLUETOOTH_LE;
    (built_in, bluetooth)
}

fn nominal_sample_rate(device: AudioObjectID) -> Option<u32> {
    let a = addr(
        K_AUDIO_DEVICE_PROPERTY_NOMINAL_SAMPLE_RATE,
        K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    );
    let mut rate: f64 = 0.0;
    let mut size = std::mem::size_of::<f64>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            device,
            &a,
            0,
            std::ptr::null(),
            &mut size,
            &mut rate as *mut _ as *mut std::ffi::c_void,
        )
    };
    if status != 0 || rate <= 0.0 {
        return None;
    }
    Some(rate.round() as u32)
}

fn device_name(device: AudioObjectID) -> Option<String> {
    let a = addr(
        K_AUDIO_OBJECT_PROPERTY_NAME,
        K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    );
    let mut cfstr: CFStringRef = std::ptr::null();
    let mut size = std::mem::size_of::<CFStringRef>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            device,
            &a,
            0,
            std::ptr::null(),
            &mut size,
            &mut cfstr as *mut _ as *mut std::ffi::c_void,
        )
    };
    if status != 0 || cfstr.is_null() {
        return None;
    }
    let mut buf = [0i8; 256];
    let ok = unsafe {
        CFStringGetCString(
            cfstr,
            buf.as_mut_ptr(),
            buf.len() as CFIndex,
            K_CF_STRING_ENCODING_UTF8,
        )
    };
    // The name property returns a +1 retained CFString; we own it.
    unsafe { CFRelease(cfstr) };
    if !ok {
        return None;
    }
    let cstr = unsafe { std::ffi::CStr::from_ptr(buf.as_ptr()) };
    cstr.to_str().ok().map(|s| s.to_string())
}

/// Read the current default output device. Returns None when there's no device
/// to report. Does not change anything — the Tahoe CoreAudio crash has no
/// programmatic fix, so we only inform the user (see module docs).
pub fn default_output_device_info() -> Option<OutputDevice> {
    let device = default_output_device()?;
    let (built_in, bluetooth) = transport_kind(device);
    let name = device_name(device);
    let sample_rate = nominal_sample_rate(device);
    info!(
        "[audio_fix] default output: {:?} ({}Hz, built_in={}, bluetooth={})",
        name,
        sample_rate.unwrap_or(0),
        built_in,
        bluetooth
    );
    Some(OutputDevice {
        name,
        built_in,
        bluetooth,
        sample_rate,
    })
}

/// Set the default output device's nominal sample rate (Hz). Used by the
/// one-click "Set my audio to 44.1 kHz" launch path so the user doesn't have to
/// open Audio MIDI Setup by hand.
///
/// Returns the device's sample rate *after* the change (read back, so the caller
/// can confirm it actually took). `Err` if there's no device or the set failed.
///
/// Note: CoreAudio quantises to a rate the device actually supports. We ask for
/// 44100 but read back whatever the device settled on so the launch gate can
/// re-evaluate against the real value rather than assume success.
pub fn set_default_output_sample_rate(target_hz: u32) -> Result<u32, String> {
    let device = default_output_device().ok_or("no default output device")?;
    let a = addr(
        K_AUDIO_DEVICE_PROPERTY_NOMINAL_SAMPLE_RATE,
        K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    );
    let rate: f64 = target_hz as f64;
    let status = unsafe {
        AudioObjectSetPropertyData(
            device,
            &a,
            0,
            std::ptr::null(),
            std::mem::size_of::<f64>() as u32,
            &rate as *const _ as *const std::ffi::c_void,
        )
    };
    if status != 0 {
        warn!(
            "[audio_fix] set sample rate {}Hz failed (status {})",
            target_hz, status
        );
        return Err(format!("CoreAudio set failed (status {})", status));
    }
    // The set is asynchronous on some devices; give it a beat, then read back.
    std::thread::sleep(std::time::Duration::from_millis(150));
    let actual = nominal_sample_rate(device).unwrap_or(target_hz);
    info!(
        "[audio_fix] set sample rate -> requested {}Hz, now {}Hz",
        target_hz, actual
    );
    Ok(actual)
}

// --- Audio route fix: switch Wine to a non-faulting output device ---

/// A device's persistent UID string (stable across reboots, e.g.
/// "BuiltInSpeakerDevice"). Needed to reference a sub-device when building an
/// aggregate, and to set the default device by identity.
fn device_uid(device: AudioObjectID) -> Option<String> {
    let a = addr(
        K_AUDIO_DEVICE_PROPERTY_DEVICE_UID,
        K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    );
    let mut cfstr_ref: CFStringRef = std::ptr::null();
    let mut size = std::mem::size_of::<CFStringRef>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            device,
            &a,
            0,
            std::ptr::null(),
            &mut size,
            &mut cfstr_ref as *mut _ as *mut std::ffi::c_void,
        )
    };
    if status != 0 || cfstr_ref.is_null() {
        return None;
    }
    let mut buf = [0i8; 256];
    let ok = unsafe {
        CFStringGetCString(
            cfstr_ref,
            buf.as_mut_ptr(),
            buf.len() as CFIndex,
            K_CF_STRING_ENCODING_UTF8,
        )
    };
    unsafe { CFRelease(cfstr_ref) };
    if !ok {
        return None;
    }
    let cstr = unsafe { std::ffi::CStr::from_ptr(buf.as_ptr()) };
    cstr.to_str().ok().map(|s| s.to_string())
}

/// True if the device has at least one output stream (i.e. it can play audio).
/// Filters out input-only devices when scanning for an output to switch to.
fn has_output_streams(device: AudioObjectID) -> bool {
    let a = addr(
        K_AUDIO_DEVICE_PROPERTY_STREAM_CONFIGURATION,
        K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
    );
    let mut size: u32 = 0;
    let status =
        unsafe { AudioObjectGetPropertyDataSize(device, &a, 0, std::ptr::null(), &mut size) };
    // An AudioBufferList with zero buffers is 4 bytes (just the count). Any real
    // output device reports a larger config.
    status == 0 && size > 4
}

/// All audio devices known to the system.
fn all_devices() -> Vec<AudioObjectID> {
    let a = addr(
        K_AUDIO_HARDWARE_PROPERTY_DEVICES,
        K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    );
    let mut size: u32 = 0;
    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &a,
            0,
            std::ptr::null(),
            &mut size,
        )
    };
    if status != 0 || size == 0 {
        return Vec::new();
    }
    let count = size as usize / std::mem::size_of::<AudioObjectID>();
    let mut ids = vec![0u32; count];
    let mut io_size = size;
    let status = unsafe {
        AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &a,
            0,
            std::ptr::null(),
            &mut io_size,
            ids.as_mut_ptr() as *mut std::ffi::c_void,
        )
    };
    if status != 0 {
        return Vec::new();
    }
    ids
}

/// Set the system default output device by AudioObjectID.
fn set_default_output(device: AudioObjectID) -> Result<(), String> {
    let a = addr(
        K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
        K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
    );
    let status = unsafe {
        AudioObjectSetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &a,
            0,
            std::ptr::null(),
            std::mem::size_of::<AudioObjectID>() as u32,
            &device as *const _ as *const std::ffi::c_void,
        )
    };
    if status != 0 {
        return Err(format!("set default output failed (status {})", status));
    }
    Ok(())
}

/// First real (non built-in, output-capable, non-virtual-loopback) device, if
/// any. This is the proven fix: AirPods/HDMI/USB headphones. We skip aggregates
/// and our own device by checking transport != built-in and that it has output.
fn first_external_output(exclude: AudioObjectID) -> Option<(AudioObjectID, String)> {
    for dev in all_devices() {
        if dev == exclude {
            continue;
        }
        if !has_output_streams(dev) {
            continue;
        }
        let (built_in, _bt) = transport_kind(dev);
        if built_in {
            continue;
        }
        // Skip virtual loopback devices (Teams/Zoom/etc.) and our own aggregate:
        // their UIDs aren't real hardware, so they may route nowhere audible.
        // We only auto-pick genuine hardware outputs here.
        let name = device_name(dev).unwrap_or_default();
        let uid = device_uid(dev).unwrap_or_default();
        let looks_virtual = uid == OUR_AGGREGATE_UID
            || name.to_lowercase().contains("teams")
            || name.to_lowercase().contains("zoom")
            || name.to_lowercase().contains("loopback")
            || name.to_lowercase().contains("aggregate")
            || name.to_lowercase().contains("screen");
        if looks_virtual {
            continue;
        }
        return Some((dev, name));
    }
    None
}

/// Find an existing aggregate device of ours by UID (to reuse or clean up).
fn find_our_aggregate() -> Option<AudioObjectID> {
    for dev in all_devices() {
        if device_uid(dev).as_deref() == Some(OUR_AGGREGATE_UID) {
            return Some(dev);
        }
    }
    None
}

/// Create our own Aggregate Device wrapping the built-in speakers as its single
/// (main) sub-device. The user still hears audio through the speakers, but Wine
/// renders to the aggregate's CoreAudio object rather than the raw built-in
/// driver that faults on Tahoe. Returns the new device id.
fn create_aggregate_over_builtin(builtin_uid: &str) -> Result<AudioObjectID, String> {
    // Tear down a stale one first so we never stack duplicates.
    if let Some(old) = find_our_aggregate() {
        unsafe { AudioHardwareDestroyAggregateDevice(old) };
    }

    unsafe {
        let dict = CFDictionaryCreateMutable(
            std::ptr::null(),
            0,
            &kCFTypeDictionaryKeyCallBacks as *const _ as *const std::ffi::c_void,
            &kCFTypeDictionaryValueCallBacks as *const _ as *const std::ffi::c_void,
        );
        if dict.is_null() {
            return Err("CFDictionaryCreateMutable failed".into());
        }

        let k_name = cfstr(AGGREGATE_NAME);
        let v_name = cfstr(OUR_AGGREGATE_NAME);
        CFDictionarySetValue(dict, k_name as *const _, v_name as *const _);

        let k_uid = cfstr(AGGREGATE_UID);
        let v_uid = cfstr(OUR_AGGREGATE_UID);
        CFDictionarySetValue(dict, k_uid as *const _, v_uid as *const _);

        let k_main = cfstr(AGGREGATE_MAIN_SUBDEVICE);
        let v_main = cfstr(builtin_uid);
        CFDictionarySetValue(dict, k_main as *const _, v_main as *const _);

        // Private aggregates are unreliable (known CoreAudio bug) and vanish, so
        // we deliberately leave it PUBLIC (omit the "private" key). We also omit
        // "stacked" (CoreAudio treats missing as false) — this is a plain
        // single-device wrapper, not a multi-output mix.
        let _ = (AGGREGATE_IS_PRIVATE, AGGREGATE_IS_STACKED);

        // subdevices = [ { uid: builtin_uid } ]
        let sub = CFDictionaryCreateMutable(
            std::ptr::null(),
            0,
            &kCFTypeDictionaryKeyCallBacks as *const _ as *const std::ffi::c_void,
            &kCFTypeDictionaryValueCallBacks as *const _ as *const std::ffi::c_void,
        );
        let k_sub_uid = cfstr(SUBDEVICE_UID);
        let v_sub_uid = cfstr(builtin_uid);
        CFDictionarySetValue(sub, k_sub_uid as *const _, v_sub_uid as *const _);

        let arr = CFArrayCreateMutable(
            std::ptr::null(),
            0,
            &kCFTypeArrayCallBacks as *const _ as *const std::ffi::c_void,
        );
        CFArrayAppendValue(arr, sub as *const _);

        let k_list = cfstr(AGGREGATE_SUBDEVICE_LIST);
        CFDictionarySetValue(dict, k_list as *const _, arr as *const _);

        let mut new_id: AudioObjectID = 0;
        let status = AudioHardwareCreateAggregateDevice(dict as CFDictionaryRef, &mut new_id);

        // Release everything we created.
        CFRelease(v_name);
        CFRelease(k_name);
        CFRelease(v_uid);
        CFRelease(k_uid);
        CFRelease(v_main);
        CFRelease(k_main);
        CFRelease(v_sub_uid);
        CFRelease(k_sub_uid);
        CFRelease(sub);
        CFRelease(arr);
        CFRelease(k_list);
        CFRelease(dict);

        if status != 0 || new_id == 0 {
            return Err(format!(
                "AudioHardwareCreateAggregateDevice failed (status {})",
                status
            ));
        }
        // CoreAudio can briefly "lose" a just-created aggregate; let it settle.
        std::thread::sleep(std::time::Duration::from_millis(250));
        Ok(new_id)
    }
}

/// The result of applying the audio route fix, so the frontend can restore it.
pub struct AppliedRoute {
    /// UID of the device that was the default before we changed it, to restore.
    pub previous_uid: Option<String>,
    /// Human-readable description of what we routed to (for logging/UI).
    pub routed_to: String,
    /// True if we created an aggregate that must be destroyed on restore.
    pub created_aggregate: bool,
}

/// Apply the audio route fix before launch. Strategy:
///   1. If the current default is NOT the built-in speakers, do nothing — we're
///      already on a safe device.
///   2. Else if a real external output exists, switch to it (proven fix).
///   3. Else create our aggregate over the built-in speakers and switch to it.
/// Returns what we did so the caller can restore on quit.
pub fn apply_audio_route_fix() -> Result<AppliedRoute, String> {
    let current = default_output_device().ok_or("no default output device")?;
    let (built_in, _bt) = transport_kind(current);
    let previous_uid = device_uid(current);

    if !built_in {
        info!("[audio_fix] default output already non-built-in; no route change");
        return Ok(AppliedRoute {
            previous_uid,
            routed_to: device_name(current).unwrap_or_else(|| "current device".into()),
            created_aggregate: false,
        });
    }

    // Prefer a genuine external device if one is plugged in.
    if let Some((ext, name)) = first_external_output(current) {
        set_default_output(ext)?;
        info!("[audio_fix] routed to external output: {}", name);
        return Ok(AppliedRoute {
            previous_uid,
            routed_to: name,
            created_aggregate: false,
        });
    }

    // Speakers-only: wrap them in our aggregate and route to that.
    let builtin_uid = device_uid(current).ok_or("could not read built-in speaker UID")?;
    let agg = create_aggregate_over_builtin(&builtin_uid)?;
    set_default_output(agg).map_err(|e| {
        // If switching failed, don't leave a dangling aggregate.
        unsafe { AudioHardwareDestroyAggregateDevice(agg) };
        e
    })?;
    info!("[audio_fix] routed to our aggregate over built-in speakers");
    Ok(AppliedRoute {
        previous_uid,
        routed_to: OUR_AGGREGATE_NAME.to_string(),
        created_aggregate: true,
    })
}

/// Restore the output device we changed, and destroy our aggregate if we made
/// one. `previous_uid` is what `apply_audio_route_fix` returned.
pub fn restore_audio_route(previous_uid: Option<&str>, destroy_aggregate: bool) {
    if let Some(uid) = previous_uid {
        if let Some(dev) = all_devices()
            .into_iter()
            .find(|d| device_uid(*d).as_deref() == Some(uid))
        {
            if let Err(e) = set_default_output(dev) {
                warn!("[audio_fix] restore default output failed: {}", e);
            } else {
                info!("[audio_fix] restored default output to {}", uid);
            }
        }
    }
    if destroy_aggregate {
        if let Some(agg) = find_our_aggregate() {
            let status = unsafe { AudioHardwareDestroyAggregateDevice(agg) };
            info!("[audio_fix] destroyed aggregate (status {})", status);
        }
    }
}
