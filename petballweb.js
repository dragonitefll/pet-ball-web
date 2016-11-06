angular.module("petBallWeb", ["ngMaterial"])
  .value("constraints", {video: {facingMode: "user"}, audio: true})
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
      navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
        var video = document.getElementById("remote-stream");

        $scope.peerConnection = new webkitRTCPeerConnection(webRTCConfig);
        $scope.dataChannel = $scope.peerConnection.createDataChannel("");

        $scope.peerConnection.addStream(stream);

        $scope.peerConnection.createOffer().then(function(offer) {
          $scope.peerConnection.setLocalDescription(offer);
        });

        $scope.peerConnection.onnegotiationneeded = function(e) {
          console.log(e);
          $scope.signalingChannel.send(JSON.stringify({
            sdp: $scope.peerConnection.localDescription,
            token: $scope.token
          }));
        }

        $scope.peerConnection.onicecandidate = function(e) {
          if (e.candidate) {
            $scope.signalingChannel.send(JSON.stringify({
              candidate: e.candidate,
              token: $scope.token
            }));
            console.log(e.candidate);
          }
        };

        $scope.signalingChannel.onmessage = function(payload) {
          console.log(payload.data);
          var message = JSON.parse(payload.data);
          if (message.sdp) {
            $scope.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp), function() {

            });
          } else {
            var parts = message.candidate.split(":");
            var candidate = new RTCIceCandidate({sdpMid: parts[0], sdpMLineIndex: parseInt(parts[1]), candidate: parts[2] + ":" + parts[3]});
            $scope.peerConnection.addIceCandidate(candidate);
          }
        };

        $scope.peerConnection.onaddstream = function(e) {
          console.log(e);
          window.event = e;
          video.srcObject = e.stream;

          $scope.inVideoCall = true;
          $scope.$apply();
        };

        document.getElementById("local-stream").srcObject = stream;
        $scope.$apply();
      });
    };

    $scope.endVideoCall = function() {
      $scope.dataChannel.close();
      $scope.peerConnection.close();
      $scope.inVideoCall = false;
      document.getElementById("remote-stream").srcObject = undefined;
      document.getElementById("local-stream").srcObject = undefined;
      window.event = null;
    };

    setInterval(function() {
      if ($scope.inVideoCall) {
        ($scope.joystickData.a != 0 && $scope.joystickData.b != 0) && console.log($scope.joystickData);
        $scope.dataChannel.send(JSON.stringify({motors: $scope.joystickData}));
      }
    }, 1000);

    $scope.$watch("laser", function(newValue) {
      if ($scope.inVideoCall) {
        $scope.dataChannel.send(JSON.stringify({laser: newValue}));
      }
    });
    $scope.laser = false;

    $scope.dispenseTreat = function() {
      $scope.dataChannel.send(JSON.stringify({treat: 1}));
    };
  })
  .directive("joystick", function() { return {
    templateUrl: "joystick.html",
    restrict: "E",
    transclude: false,
    scope: {value: "=ngModel"},
    controller: function($scope) {
      $scope.size = 200;
      $scope.joystickSize = {width: $scope.size + "px", height: $scope.size + "px"};
      $scope.joystickInnerStyle = {width: $scope.size / 10 + "px", height: $scope.size / 10 + "px"};
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
          $scope.joystickInnerStyle.left = e.offsetX - ($scope.size / 20) + "px";
          $scope.joystickInnerStyle.top = e.offsetY - ($scope.size / 20) + "px";
        }
      };
      $scope.mouseup = function(e) {
        $scope.value = {a: 0, b: 0};
        $scope.resetJoystickInner();
      };
      $scope.resetJoystickInner = function() {
        $scope.joystickInnerStyle.transition = "all 0.2s";
        $scope.joystickInnerStyle.left = $scope.size * 0.45 + "px";
        $scope.joystickInnerStyle.top = $scope.size * 0.45 + "px";
      };
      $scope.mouseup(null);
    }
  }})
