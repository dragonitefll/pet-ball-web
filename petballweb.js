angular.module("petBallWeb", ["ngMaterial"])
  .value("constraints", {video: true, audio: true})
  .value("webRTCConfig", {iceServers: [{url: "stun:stun.l.google.com:19302"}]})
  .controller("PetBallWebController", function($scope, constraints, webRTCConfig) {
    $scope.firebase = firebase;

    firebase.auth().onAuthStateChanged(function(user) {
      if (user) {
        user.getToken(true).then(function(token) {
          $scope.token = token;
          $scope.handshake();
        });
      } else {
        $scope.token = undefined;
      }
      $scope.currentUser = user;
      $scope.$apply();
    });

    $scope.signIn = function() {
      if ($scope.email && $scope.password) {
        firebase.auth().signInWithEmailAndPassword($scope.email, $scope.password).then(function(result) {
          console.log("Signed in!");
          console.debug(result);
        }, function(error) {
          console.log("Error");
          console.debug(error);
        })
      }
    };

    $scope.signalingChannel = new WebSocket("wss://petball.ward.li:3000");
    $scope.signalingChannel.onopen = $scope.handshake;

    $scope.needsHandshake = true;

    $scope.handshake = function() {
      if ($scope.signalingChannel.readyState == 1 && $scope.token && $scope.needsHandshake) {
        $scope.signalingChannel.send(JSON.stringify({
          hello: "web",
          token: $scope.token
        }));
        $scope.needsHandshake = false;
      }
    };

    $scope.inVideoCall = false;

    $scope.startVideoCall = function() {
      navigator.getUserMedia(constraints, function(stream) {
        var video = document.getElementById("remote-stream");

        var pc = new webkitRTCPeerConnection(webRTCConfig);

        pc.addStream(stream);

        pc.createOffer().then(function(offer) {
          pc.setLocalDescription(offer);
        });

        pc.onnegotiationneeded = function(e) {
          console.log(e);
          $scope.signalingChannel.send(JSON.stringify({
            sdp: pc.localDescription,
            token: $scope.token
          }));
        }

        pc.onicecandidate = function(e) {
          if (e.candidate) {
            $scope.signalingChannel.send(JSON.stringify({
              candidate: e.candidate,
              token: $scope.token
            }));
          }
        };

        $scope.signalingChannel.onmessage = function(payload) {
          var message = JSON.parse(payload.data);
          if (message.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(message.sdp), function() {

            });
          } else {
            var parts = message.candidate.split(":");
            var candidate = new RTCIceCandidate({sdpMid: parts[0], sdpMLineIndex: parseInt(parts[1]), candidate: parts[2] + ":" + parts[3]});
            pc.addIceCandidate(candidate);
          }
        };

        pc.onaddstream = function(e) {
          console.log(e);
          window.event = e;
          video.srcObject = e.stream;

          $scope.inVideoCall = true;
          $scope.$apply();
        };
      }, angular.noop);
    };

    $scope.$watch("joystickData", function(newValue, oldValue) {
      if ($scope.inVideoCall) {
        $scope.signalingChannel.send(JSON.stringify({
          motors: newValue,
          token: $scope.token
        }));
      }
    })
  })
  .directive("joystick", function() { return {
    templateUrl: "joystick.html",
    restrict: "E",
    transclude: false,
    scope: {value: "=ngModel"},
    controller: function($scope) {
      $scope.size = 100;
      $scope.joystickSize = {width: $scope.size + "px", height: $scope.size + "px"};
      $scope.joystickInnerStyle = {width: $scope.size / 5 + "px", height: $scope.size / 5 + "px"};
      $scope.mousemove = function(e) {
        e.preventDefault();
        if (e.buttons > 0) {
          var x = e.offsetX - ($scope.size / 2);
          var y = e.offsetY - ($scope.size / 2);

          var speed = Math.round(Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)) * 255 / ($scope.size / 2));
          var direction = Math.round(Math.atan2(y, x) * 180 / Math.PI) + 90;

          var d = (90 - Math.abs(Math.abs(direction) - 90)) * 17 / 3;
          var m = (Math.abs(direction) > 90) ? -1 : 1;

          $scope.value = {a: Math.round(speed * m + d), b: Math.round(speed * m - d)};

          $scope.joystickInnerStyle.transition = "none";
          $scope.joystickInnerStyle.left = e.offsetX - ($scope.size / 10) + "px";
          $scope.joystickInnerStyle.top = e.offsetY - ($scope.size / 10) + "px";
        }
      };
      $scope.mouseup = function(e) {
        $scope.value = {a: 0, b: 0};
        $scope.resetJoystickInner();
      };
      $scope.resetJoystickInner = function() {
        $scope.joystickInnerStyle.transition = "all 0.2s";
        $scope.joystickInnerStyle.left = $scope.size * 0.4 + "px";
        $scope.joystickInnerStyle.top = $scope.size * 0.4 + "px";
      };
      $scope.mouseup(null);
    }
  }})
